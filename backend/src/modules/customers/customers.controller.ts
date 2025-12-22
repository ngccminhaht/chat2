import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Delete,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomersService } from './customers.service';
import { GetCustomersDto, UpdateCustomerDto } from './dto';
import { JwtAuthGuard } from '@/common/guards';

function validateObjectId(id: string, fieldName: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${fieldName}`);
  }
}

@Controller('organizations/:organizationId/customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(
    @Param('organizationId') organizationId: string,
    @Query() dto: GetCustomersDto,
  ) {
    validateObjectId(organizationId, 'organization ID');
    return this.customersService.findAll(organizationId, dto);
  }

  @Get('filters/domains')
  getUniqueDomains(@Param('organizationId') organizationId: string) {
    validateObjectId(organizationId, 'organization ID');
    return this.customersService.getUniqueDomains(organizationId);
  }

  @Get('filters/tags')
  getUniqueTags(@Param('organizationId') organizationId: string) {
    validateObjectId(organizationId, 'organization ID');
    return this.customersService.getUniqueTags(organizationId);
  }

  @Get(':id')
  findOne(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    validateObjectId(organizationId, 'organization ID');
    validateObjectId(id, 'customer ID');
    return this.customersService.findOne(organizationId, id);
  }

  @Patch(':id')
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    validateObjectId(organizationId, 'organization ID');
    validateObjectId(id, 'customer ID');
    return this.customersService.update(organizationId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    validateObjectId(organizationId, 'organization ID');
    validateObjectId(id, 'customer ID');
    return this.customersService.remove(organizationId, id);
  }
}
