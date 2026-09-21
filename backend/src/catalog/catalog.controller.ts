import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminHttpGuard } from '../common/guards/admin-http.guard';
import { CatalogService } from './catalog.service';
import { ImportDto, PackDto, QuestionDto } from './dto/catalog.dto';
import { PackEntity } from './entities/pack.entity';
import { QuestionEntity } from './entities/question.entity';

@UseGuards(AdminHttpGuard)
@Controller('api/admin/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('packs')
  packs(): Promise<PackEntity[]> {
    return this.catalog.listPacks();
  }

  @Get('packs/stats')
  packStats(): Promise<Array<{ packId: string; main: number; final: number }>> {
    return this.catalog.packStats();
  }

  @Post('packs')
  createPack(@Body() dto: PackDto): Promise<PackEntity> {
    return this.catalog.createPack(dto);
  }

  @Put('packs/:id')
  updatePack(@Param('id') id: string, @Body() dto: PackDto): Promise<PackEntity> {
    return this.catalog.updatePack(id, dto);
  }

  @Delete('packs/:id')
  deletePack(@Param('id') id: string): Promise<void> {
    return this.catalog.deletePack(id);
  }

  @Get('questions')
  questions(
    @Query('packId') packId?: string,
    @Query('kind') kind?: 'MAIN' | 'FINAL',
  ): Promise<QuestionEntity[]> {
    return this.catalog.listQuestions(packId, kind);
  }

  @Get('questions/:id')
  question(@Param('id') id: string): Promise<QuestionEntity> {
    return this.catalog.getQuestion(id);
  }

  @Post('questions')
  createQuestion(@Body() dto: QuestionDto): Promise<QuestionEntity> {
    return this.catalog.createQuestion(dto);
  }

  @Put('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: QuestionDto): Promise<QuestionEntity> {
    return this.catalog.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string): Promise<void> {
    return this.catalog.deleteQuestion(id);
  }

  /** Podgląd parsowania — admin widzi, co się utworzy, zanim zapisze. */
  @Post('import/preview')
  preview(@Body() dto: ImportDto): QuestionDto {
    return this.catalog.parseImport(dto);
  }

  @Post('import')
  importQuestion(@Body() dto: ImportDto): Promise<QuestionEntity> {
    return this.catalog.createQuestion(this.catalog.parseImport(dto));
  }
}
