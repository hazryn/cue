import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuzzerModule } from '../buzzer/buzzer.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GameEventEntity } from './entities/game-event.entity';
import { GameEntity } from './entities/game.entity';
import { TeamEntity } from './entities/team.entity';
import { GameController } from './game.controller';
import { GameService } from './game.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameEntity, TeamEntity, GameEventEntity]),
    BuzzerModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
