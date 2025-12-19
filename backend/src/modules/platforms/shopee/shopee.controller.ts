import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  Logger,
  Req,
  Query,
  Res,
  UseGuards,
  Request as NestRequest,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { ShopeeWebhookDto } from "./dto/shopee-webhook.dto";
import {
  ShopeeAuthUrlDto,
  ShopeeAuthorizeDto,
  ShopeeCallbackDto,
} from "./dto/oauth.dto";
import { ShopeeService } from "./shopee.service";
import { WebhookPublisherService } from "@/modules/webhooks/webhook-publisher.service";
import { OAuthStateService } from "@/modules/connections/oauth-state.service";
import { EnvService } from "@/common/env";

interface RawBodyRequest<T> extends Request {
  rawBody?: Buffer;
}

/**
 * Shopee Controller
 *
 * Handles HTTP endpoints for Shopee webhooks:
 * - GET /api/shopee/webhook (webhook verification)
 * - POST /api/shopee/webhook (webhook receiving & publishing to Kafka)
 */
@Controller("shopee")
export class ShopeeController {
  private readonly logger = new Logger(ShopeeController.name);

  constructor(
    private readonly shopeeService: ShopeeService,
    private readonly webhookPublisher: WebhookPublisherService,
    private readonly envService: EnvService,
    private readonly oauthStateService: OAuthStateService
  ) {}

  /**
   * GET /api/shopee/webhook
   * Shopee webhook verification - return success response
   */
  @Get("webhook")
  @HttpCode(200)
  async verifyWebhook(): Promise<{ code: number; message: string }> {
    this.logger.log("📋 Shopee webhook verification");
    return { code: 0, message: "success" };
  }

  /**
   * POST /api/shopee/webhook
   * Receive webhook events from Shopee
   */
  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: ShopeeWebhookDto,
    @Headers("authorization") authorization: string
  ): Promise<{ code: number; message: string }> {
    this.logger.log(
      `📥 Shopee: Shop ${payload.shop_id} | Type: ${
        payload.data?.message_type || "verify"
      }`
    );

    // Check if this is a verification message from Shopee
    if (payload.data?.verify_info) {
      this.logger.log("✅ Shopee verification message");
      return { code: 0, message: "success" };
    }

    // Verify signature
    if (authorization) {
      const partnerKey = this.envService.get("SHOPEE_PARTNER_KEY");
      if (partnerKey) {
        // Build full URL for signature verification
        const protocol = req.protocol;
        const host = req.get("host");
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        const rawBody =
          req.rawBody?.toString("utf8") || JSON.stringify(payload);

        const isValid = this.shopeeService.verifySignature(
          fullUrl,
          rawBody,
          authorization,
          partnerKey
        );

        if (!isValid) {
          this.logger.error("⚠️  Invalid signature");
          return { code: 1, message: "Invalid signature" };
        }
      }
    }

    // Publish to Kafka for async processing
    this.webhookPublisher
      .publishWebhookEvent("shopee", payload, authorization)
      .catch((error) => {
        this.logger.error("❌ Kafka publish failed:", error);
      });

    return { code: 0, message: "success" };
  }

  // ==================== OAuth Routes ====================

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/shopee/authorize?userId=xxx&organizationId=xxx
   */
  @Get("authorize")
  async authorize(@Query() dto: ShopeeAuthorizeDto, @Res() res: Response) {
    this.logger.log("🔐 User authorizing Shopee:", { userId: dto.userId, organizationId: dto.organizationId });

    const { url, state } = this.shopeeService.getAuthorizationUrl(dto.state);

    await this.oauthStateService.storeState(state, {
      state,
      userId: dto.userId,
      organizationId: dto.organizationId,
      createdAt: Date.now(),
    });

    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Shopee
   * GET /api/shopee/callback?code=xxx&state=xxx&shop_id=xxx
   */
  @Get("callback")
  async callback(@Query() dto: ShopeeCallbackDto, @Res() res: Response) {
    this.logger.log("🔙 Shopee callback received:", {
      code: dto.code?.substring(0, 20) + "...",
      state: dto.state,
      shopId: dto.shop_id,
    });

    const storedStateData = await this.oauthStateService.getAndDeleteState(
      dto.state
    );
    if (!storedStateData) {
      throw new BadRequestException("OAuth state not found or expired");
    }

    const userId = storedStateData.userId;
    const organizationId = storedStateData.organizationId;

    if (!organizationId) {
      throw new BadRequestException("Organization ID is required for Shopee connection");
    }

    const tokenResponse = await this.shopeeService.exchangeCodeForToken(
      dto.code,
      dto.shop_id
    );
    const shopInfo = await this.shopeeService.getShopInfo(
      tokenResponse.access_token,
      parseInt(dto.shop_id)
    );

    const connection = await this.shopeeService.savePlatformConnection(
      userId,
      organizationId,
      tokenResponse,
      shopInfo
    );

    this.shopeeService
      .syncConversations(connection._id.toString())
      .catch((error) => {
        this.logger.error("Failed to sync conversations:", error);
      });

    const frontendUrl = this.envService.get("FRONTEND_URL");
    return res.redirect(
      `${frontendUrl}/connections?status=success&platform=shopee&account=${shopInfo.shop_name}`
    );
  }

  /**
   * Get authorization URL as JSON
   * GET /api/shopee/auth-url?organizationId=xxx
   */
  @Get("auth-url")
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(@Query() dto: ShopeeAuthUrlDto, @NestRequest() req: any) {
    const userId = req.user.userId;
    const { url, state } = this.shopeeService.getAuthorizationUrl(dto.state);

    await this.oauthStateService.storeState(state, {
      state,
      userId,
      organizationId: dto.organizationId,
      createdAt: Date.now(),
    });

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Complete OAuth with code
   * GET /api/shopee/complete?code=xxx&state=xxx&shop_id=xxx
   */
  @Get("complete")
  @UseGuards(JwtAuthGuard)
  async completeOAuth(
    @Query() dto: ShopeeCallbackDto,
    @NestRequest() req: any
  ) {
    const userId = req.user.userId;

    const storedStateData = await this.oauthStateService.getAndDeleteState(
      dto.state
    );
    if (!storedStateData) {
      throw new BadRequestException("OAuth state not found or expired");
    }

    const organizationId = storedStateData.organizationId;
    if (!organizationId) {
      throw new BadRequestException("Organization ID is required for Shopee connection");
    }

    const tokenResponse = await this.shopeeService.exchangeCodeForToken(
      dto.code,
      dto.shop_id
    );
    const shopInfo = await this.shopeeService.getShopInfo(
      tokenResponse.access_token,
      parseInt(dto.shop_id)
    );

    const connection = await this.shopeeService.savePlatformConnection(
      userId,
      organizationId,
      tokenResponse,
      shopInfo
    );

    this.shopeeService
      .syncConversations(connection._id.toString())
      .catch((error) => {
        this.logger.error("Failed to sync conversations:", error);
      });

    return {
      success: true,
      message: `Connected Shopee shop: ${shopInfo.shop_name}`,
      connection: {
        id: connection._id,
        platform: connection.platform,
        accountName: connection.platformAccountName,
        status: connection.status,
      },
    };
  }
}
