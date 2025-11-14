import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from '@/common/database/schemas';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<OrganizationDocument>,
  ) {}

  async create(orgData: Partial<Organization>): Promise<OrganizationDocument> {
    const organization = new this.organizationModel(orgData);
    return organization.save();
  }

  async findById(id: string): Promise<OrganizationDocument | null> {
    return this.organizationModel.findById(id).exec();
  }

  async findAll(): Promise<OrganizationDocument[]> {
    return this.organizationModel.find({ isActive: true }).exec();
  }

  async update(id: string, updateData: Partial<Organization>): Promise<OrganizationDocument | null> {
    return this.organizationModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.organizationModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }
}
