import { bookingService } from '../services/booking.service.js';

const SWEEP_INTERVAL_MS = 30 * 1000;
let sweeping = false;
let timer = null;

/**
 * Cron Task Scheduler Initializer
 * - dispatch sweep: abandons unpaid bookings, re-opens jobs partners never accepted, auto-assigns waiting jobs,
 *   and refunds bookings that nobody could serve (replaces the old in-memory setTimeout that was lost on restart)
 */
export const initCronJobs = () => {
  if (timer) return;
  const run = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await bookingService.runDispatchSweep();
    } catch (err) {
      console.error('Dispatch sweep error:', err.message);
    } finally {
      sweeping = false;
    }
  };
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
  console.log('⏱️  Dispatch sweep scheduled every 30s');
};

export const stopCronJobs = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
