import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Ack, NS, TvView } from '@cue/shared';
import { Namespace } from 'socket.io';
import { GameService } from '../game/game.service';
import { BroadcastService } from './broadcast.service';

@WebSocketGateway({ namespace: NS.TV, cors: { origin: true } })
export class TvGateway implements OnGatewayInit {
  private readonly logger = new Logger('TvGateway');

  constructor(
    private readonly games: GameService,
    private readonly broadcast: BroadcastService,
  ) {}

  afterInit(namespace: Namespace): void {
    this.broadcast.register(NS.TV, namespace);
    this.logger.log('Namespace /tv gotowy');
  }

  /** Telewizor po odświeżeniu prosi o pełny obraz — bez tego czekałby na kolejną akcję. */
  @SubscribeMessage('tv:hello')
  async hello(): Promise<Ack<{ view: TvView; serverTime: number }>> {
    const input = await this.games.publishInput();
    return { ok: true, seq: input.seq, data: { view: this.broadcast.tvView(input), serverTime: Date.now() } };
  }
}
