import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { AdminHttpGuard } from '../common/guards/admin-http.guard';
import { GameService } from './game.service';

class CreateGameDto {
  /** Puste = wszystkie pakiety wchodzą do puli */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  packIds?: string[];

  /** Domyślnie drużyny przechodzą do nowej gry; `false` zaczyna od pustego lobby */
  @IsOptional()
  @IsBoolean()
  keepTeams?: boolean;
}

@Controller('api/game')
export class GameController {
  constructor(private readonly games: GameService) {}

  /** Publiczne: telefon gracza i telewizor muszą wiedzieć, czy jest do czego dołączać. */
  @Get('current')
  async current(): Promise<{ exists: boolean; code?: string; phase?: string }> {
    const game = await this.games.currentGame();
    if (!game) return { exists: false };
    return { exists: true, code: game.code, phase: game.phase };
  }

  @UseGuards(AdminHttpGuard)
  @Post()
  async create(@Body() dto: CreateGameDto): Promise<{ id: string; code: string }> {
    const game = await this.games.createGame(dto.packIds ?? null, dto.keepTeams ?? true);
    return { id: game.id, code: game.code };
  }
}
