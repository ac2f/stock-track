import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { NotificationType } from '../enums/notification.enums';
import { NotificationsService } from '../notifications.service';

/**
 * Borç hatırlatma. Eşik üstü bakiyesi olan müşterilere periyodik hatırlatma
 * gönderir. SCHEDULER_ENABLED=false ise çalışmaz (cluster'da tek replikada açık).
 */
@Injectable()
export class DebtReminderScheduler {
  private readonly logger = new Logger(DebtReminderScheduler.name);
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly portalBaseUrl: string;

  constructor(
    private readonly notifications: NotificationsService,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
    this.threshold =
      configService.get<number>('notifications.debtReminderThreshold') ?? 0;
    this.portalBaseUrl =
      configService.get<string>('business.portalBaseUrl') ?? '';
  }

  @Cron(process.env.DEBT_REMINDER_CRON || '0 9 * * *')
  async handle(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const debtors = await this.customersRepo.find({
      where: { currentBalance: MoreThan(this.threshold) },
    });
    this.logger.log(`Borç hatırlatma: ${debtors.length} müşteri.`);

    for (const customer of debtors) {
      const portalLink =
        this.portalBaseUrl && customer.portalToken
          ? ` Detay: ${this.portalBaseUrl}/${customer.portalToken}`
          : '';
      await this.notifications.notify({
        type: NotificationType.DEBT_REMINDER,
        subject: 'Borç hatırlatması',
        body:
          `Sayın ${customer.name}, güncel bakiyeniz ${customer.currentBalance}. ` +
          `Ödemeniz için teşekkür ederiz.${portalLink}`,
        telegramChatId: customer.telegramChatId,
        whatsappPhone: customer.phone,
        relatedType: 'customer',
        relatedId: customer.id,
      });
    }
  }
}
