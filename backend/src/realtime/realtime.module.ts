import { Module, forwardRef } from '@nestjs/common';
import { BuzzerModule } from '../buzzer/buzzer.module';
import { GameModule } from '../game/game.module';
import { AdminGateway } from './admin.gateway';
import { BroadcastService } from './broadcast.service';
import { PlayerGateway } from './player.gateway';
import { PresenceService } from './presence.service';
import { TvGateway } from './tv.gateway';

@Module({
  imports: [BuzzerModule, forwardRef(() => GameModule)],
  providers: [BroadcastService, PresenceService, TvGateway, AdminGateway, PlayerGateway],
  exports: [BroadcastService, PresenceService],
})
export class RealtimeModule {}
