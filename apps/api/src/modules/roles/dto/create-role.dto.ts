import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AVAILABLE_MODULES, AVAILABLE_ACTIONS } from '../constants/default-roles.constant';

export class PermissionDto {
  @ApiProperty({
    description: 'Module name',
    example: 'sales',
    enum: AVAILABLE_MODULES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([...AVAILABLE_MODULES])
  module: string;

  @ApiProperty({
    description: 'List of allowed actions',
    example: ['view', 'create', 'edit'],
    enum: AVAILABLE_ACTIONS,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...AVAILABLE_ACTIONS], { each: true })
  actions: string[];
}

export class CreateRoleDto {
  @ApiProperty({
    description: 'Role name',
    example: 'Sales Manager',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Role description',
    example: 'Can manage sales team and approve quotes',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: 'List of permissions for this role',
    type: [PermissionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
