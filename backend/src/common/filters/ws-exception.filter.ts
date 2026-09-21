import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Ack } from '@cue/shared';

/** Zamienia wyjątek w ack {ok:false}, żeby klient zawsze wiedział, co się stało. */
@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('WS');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ack = host.getArgByIndex(2);
    const message = exception instanceof Error ? exception.message : 'Błąd serwera';
    this.logger.error(message);
    if (typeof ack === 'function') {
      const response: Ack = { ok: false, code: 'INTERNAL', error: message };
      ack(response);
    }
  }
}
