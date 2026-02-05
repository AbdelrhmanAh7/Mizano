import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({
    description: 'User ID to assign the role to',
    example: 'clm1234567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Role ID to assign',
    example: 'clm0987654321fedcba',
  })
  @IsString()
  @IsNotEmpty()
  roleId: string;
}
