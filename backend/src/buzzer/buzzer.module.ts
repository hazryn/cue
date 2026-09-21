import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuzzerService } from './buzzer.service';
import { ClockSyncService } from './clock-sync.service';
import { BuzzPressEntity } from './entities/buzz-press.entity';
import { BuzzRaceEntity } from './entities/buzz-race.entity';
import { OffsetCorrectedStrategy } from './strategies/offset-corrected.strategy';

@Module({
  imports: [TypeOrmModule.forFeature([BuzzRaceEntity, BuzzPressEntity])],
  providers: [BuzzerService, ClockSyncService, OffsetCorrectedStrategy],
  exports: [BuzzerService, ClockSyncService],
})
export class BuzzerModule {}
