/**
 * Platform Verification Controller
 * Handles platform-specific verification endpoints (e.g., Zalo verification HTML)
 */

import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller()
export class PlatformVerificationController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Zalo platform verification endpoint
   * Zalo requires a specific HTML file to be served for domain verification
   */
  @Get('/zalo_verifier:token.html')
  @Get('/webhook/zalo_verifier:token.html')
  zaloVerification(@Res() res: Response): void {
    const verificationToken =
      this.configService.get<string>('ZALO_VERIFICATION_TOKEN') ||
      'Hl-69CBzBm8yWwbLvh8cLG2VfNFiwN4jCZ0s';

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="${verificationToken}" />
</head>
<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>
</html>`);
  }
}
