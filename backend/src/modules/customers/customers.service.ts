import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '@/common/database/schemas/customer.schema';
import { GetCustomersDto, UpdateCustomerDto } from './dto';
import { Platform } from '@/common/constants';

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CreateCustomerData {
  organizationId: string;
  name?: string;
  email?: string;
  phone?: string;
  widgetSessionId?: string;
  platform?: Platform;
  platformUserId?: string;
  deviceInfo?: {
    browser?: string;
    browserVersion?: string;
    os?: string;
    osVersion?: string;
    device?: string;
    screenWidth?: number;
    screenHeight?: number;
    language?: string;
    timezone?: string;
  };
  domain?: string;
  referrer?: string;
  landingPage?: string;
  ipAddress?: string;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Find all customers for an organization with filtering
   */
  async findAll(organizationId: string, dto: GetCustomersDto) {
    const { search, domain, tag, page = 1, limit = 20, sortBy = 'lastSeenAt', sortOrder = -1 } = dto;

    const filter: any = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (search) {
      const escapedSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    if (domain) {
      filter.domains = domain;
    }

    if (tag) {
      filter.tags = tag;
    }

    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find customer by ID with org check
   */
  async findOne(organizationId: string, id: string) {
    const customer = await this.customerModel
      .findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  /**
   * Find or create customer by widget session ID
   */
  async findOrCreateBySession(data: CreateCustomerData): Promise<CustomerDocument> {
    const { organizationId, widgetSessionId, ...customerData } = data;

    if (!widgetSessionId) {
      throw new Error('widgetSessionId is required');
    }

    let customer = await this.customerModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      widgetSessionId,
    });

    const now = new Date();

    if (customer) {
      // Update existing customer - use atomic operation to prevent race condition
      const updates: any = {
        $set: { lastSeenAt: now },
      };

      if (customerData.name) updates.$set.name = customerData.name;
      if (customerData.email) updates.$set.email = customerData.email;
      if (customerData.phone) updates.$set.phone = customerData.phone;
      if (customerData.deviceInfo) updates.$set.deviceInfo = customerData.deviceInfo;
      if (customerData.ipAddress) updates.$set.ipAddress = customerData.ipAddress;

      // Add domain to list atomically (cap at 100 domains)
      if (customerData.domain) {
        updates.$set.lastSeenDomain = customerData.domain;
        updates.$push = {
          domains: {
            $each: [customerData.domain],
            $slice: -100, // Keep last 100 domains
          },
        };
      }

      customer = await this.customerModel.findByIdAndUpdate(
        customer._id,
        updates,
        { new: true },
      );

      this.logger.debug(`Updated customer ${customer._id} for session ${widgetSessionId}`);
    } else {
      // Create new customer
      customer = await this.customerModel.create({
        organizationId: new Types.ObjectId(organizationId),
        widgetSessionId,
        name: customerData.name || 'Visitor',
        email: customerData.email,
        phone: customerData.phone,
        deviceInfo: customerData.deviceInfo,
        firstSeenDomain: customerData.domain,
        lastSeenDomain: customerData.domain,
        domains: customerData.domain ? [customerData.domain] : [],
        referrer: customerData.referrer,
        landingPage: customerData.landingPage,
        ipAddress: customerData.ipAddress,
        firstSeenAt: now,
        lastSeenAt: now,
        platformIdentities: customerData.platform && customerData.platformUserId
          ? [{
              platform: customerData.platform,
              platformUserId: customerData.platformUserId,
              displayName: customerData.name,
            }]
          : [],
      });

      this.logger.log(`Created new customer ${customer._id} for session ${widgetSessionId}`);
    }

    return customer;
  }

  /**
   * Find or create customer by platform identity
   */
  async findOrCreateByPlatform(
    organizationId: string,
    platform: Platform,
    platformUserId: string,
    displayName?: string,
    avatar?: string,
  ): Promise<CustomerDocument> {
    let customer = await this.customerModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      'platformIdentities.platform': platform,
      'platformIdentities.platformUserId': platformUserId,
    });

    const now = new Date();

    if (customer) {
      // Update last seen
      customer = await this.customerModel.findByIdAndUpdate(
        customer._id,
        { lastSeenAt: now },
        { new: true },
      );
    } else {
      // Create new customer
      customer = await this.customerModel.create({
        organizationId: new Types.ObjectId(organizationId),
        name: displayName || 'Customer',
        avatar,
        platformIdentities: [{
          platform,
          platformUserId,
          displayName,
          avatar,
        }],
        firstSeenAt: now,
        lastSeenAt: now,
      });

      this.logger.log(`Created new customer ${customer._id} for ${platform}:${platformUserId}`);
    }

    return customer;
  }

  /**
   * Update customer details with org check
   */
  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.customerModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          organizationId: new Types.ObjectId(organizationId),
        },
        dto,
        { new: true },
      )
      .lean()
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    this.logger.log(`Updated customer ${id}: ${JSON.stringify(dto)}`);
    return customer;
  }

  /**
   * Increment conversation count
   */
  async incrementConversationCount(customerId: string) {
    await this.customerModel.findByIdAndUpdate(customerId, {
      $inc: { totalConversations: 1 },
      lastContactedAt: new Date(),
    });
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(customerId: string) {
    await this.customerModel.findByIdAndUpdate(customerId, {
      $inc: { totalMessages: 1 },
    });
  }

  /**
   * Get unique domains for filtering
   */
  async getUniqueDomains(organizationId: string): Promise<string[]> {
    const result = await this.customerModel.distinct('domains', {
      organizationId: new Types.ObjectId(organizationId),
    });
    return result.filter(Boolean);
  }

  /**
   * Get unique tags for filtering
   */
  async getUniqueTags(organizationId: string): Promise<string[]> {
    const result = await this.customerModel.distinct('tags', {
      organizationId: new Types.ObjectId(organizationId),
    });
    return result.filter(Boolean);
  }

  /**
   * Delete customer with org check
   */
  async remove(organizationId: string, id: string) {
    const customer = await this.customerModel
      .findOneAndDelete({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    this.logger.log(`Deleted customer ${id}`);
    return { success: true, deletedCustomer: customer._id };
  }
}
