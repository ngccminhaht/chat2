import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async getAllOrganizations() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  async getOrganization(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Post()
  async createOrganization(@Body() orgData: any) {
    return this.organizationsService.create(orgData);
  }

  @Put(':id')
  async updateOrganization(@Param('id') id: string, @Body() updateData: any) {
    return this.organizationsService.update(id, updateData);
  }

  @Delete(':id')
  async deleteOrganization(@Param('id') id: string) {
    return this.organizationsService.delete(id);
  }
}
