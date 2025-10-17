"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = __importDefault(require("@fastify/helmet"));
const compress_1 = __importDefault(require("@fastify/compress"));
const cors_1 = __importDefault(require("@fastify/cors"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({
        logger: true,
    }));
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('app.port') ?? 3000;
    const corsOrigins = configService.get('app.corsOrigin');
    await app.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: [`'self'`],
                styleSrc: [`'self'`, `'unsafe-inline'`],
                scriptSrc: [`'self'`, `'unsafe-inline'`, `'unsafe-eval'`],
                imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
                fontSrc: [`'self'`, 'fonts.gstatic.com', 'data:'],
            },
        },
    });
    await app.register(cors_1.default, {
        origin: corsOrigins,
        credentials: true,
    });
    await app.register(compress_1.default);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    app.setGlobalPrefix('api/v1', {
        exclude: ['health', 'auth/health'],
    });
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
bootstrap();
//# sourceMappingURL=main.js.map