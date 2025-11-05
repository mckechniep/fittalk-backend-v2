import { registerAs } from '@nestjs/config';

/**
 * Transaction Configuration
 *
 * Centralized configuration for Prisma transaction behavior.
 * Ensures consistent transaction settings across all services.
 *
 * Usage:
 * ```typescript
 * constructor(private configService: ConfigService) {}
 *
 * const txConfig = this.configService.get('transaction.default');
 * await this.prisma.$transaction(async (tx) => { ... }, txConfig);
 * ```
 */
export default registerAs('transaction', () => ({
  /**
   * Default transaction options
   * Applied to all transactions unless overridden
   */
  default: {
    /**
     * Maximum time to wait for a transaction to acquire a lock (ms)
     * Prevents indefinite waiting when database is under load
     */
    maxWait: parseInt(process.env.TRANSACTION_MAX_WAIT || '2000', 10),

    /**
     * Maximum time a transaction can run before timing out (ms)
     * Prevents long-running transactions that block other operations
     */
    timeout: parseInt(process.env.TRANSACTION_TIMEOUT || '5000', 10),

    /**
     * Isolation level for transactions
     * ReadCommitted: Good balance between consistency and performance
     */
    isolationLevel: 'ReadCommitted' as const,
  },

  /**
   * Long-running transaction options
   * For operations that legitimately need more time (e.g., bulk imports)
   */
  longRunning: {
    maxWait: parseInt(process.env.TRANSACTION_LONG_MAX_WAIT || '5000', 10),
    timeout: parseInt(process.env.TRANSACTION_LONG_TIMEOUT || '15000', 10),
    isolationLevel: 'ReadCommitted' as const,
  },

  /**
   * Critical transaction options
   * For operations requiring stronger consistency (e.g., financial operations)
   */
  critical: {
    maxWait: parseInt(process.env.TRANSACTION_CRITICAL_MAX_WAIT || '3000', 10),
    timeout: parseInt(process.env.TRANSACTION_CRITICAL_TIMEOUT || '10000', 10),
    isolationLevel: 'Serializable' as const,
  },
}));
