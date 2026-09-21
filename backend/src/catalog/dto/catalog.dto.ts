import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  text!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  weight!: number;
}

export class QuestionDto {
  @IsString()
  packId!: string;

  @IsIn(['MAIN', 'FINAL'])
  kind!: 'MAIN' | 'FINAL';

  @IsString()
  @MinLength(3)
  text!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  /** MAIN: 3–10 odpowiedzi, FINAL: dokładnie 10 — walidacja domenowa w serwisie */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}

export class ImportDto {
  @IsString()
  packId!: string;

  @IsIn(['MAIN', 'FINAL'])
  kind!: 'MAIN' | 'FINAL';

  /** Blok tekstu: pierwsza linia to pytanie, kolejne „odpowiedź<TAB>waga" */
  @IsString()
  @MinLength(5)
  text!: string;
}
