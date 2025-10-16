import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '10', 10),
  },
  trackSessions: process.env.TRACK_SESSIONS !== 'false', // Default true
}));

// export default () => ({
//   port: parseInt(process.env.PORT ?? '3000', 10),
//   environment: process.env.NODE_ENV || 'development',
//   throttle: {
//     ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
//     limit: parseInt(process.env.THROTTLE_LIMIT ?? '10', 10),
//   },
// });
