import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

// PartialType copies every validator of CreateCustomerDto as optional, so the edit form's
// notes and nested billingAddress/shippingAddress are whitelisted here too (#259).
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
