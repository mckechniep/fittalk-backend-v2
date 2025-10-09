# FitTalk Backend

Backend API for the FitTalk fitness application. Built with NestJS, Fastify, and Supabase.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** ([Installation guide](https://pnpm.io/installation))
  ```bash
  npm install -g pnpm
  ```
- **Docker & Docker Compose** ([Download](https://www.docker.com/products/docker-desktop))
- **Git** ([Download](https://git-scm.com/downloads))

## Getting Started (New Collaborators)

### Quick Setup (Recommended)

**The setup script automatically installs all dependencies, configures the environment, and sets up the database. Just run these commands:**

```bash
# 1. Clone the repository
git clone https://github.com/mdeadwiler/Back-End-FitTalk.git
cd Back-End-FitTalk

# 2. Run the automated setup script (installs everything!)
./setup.sh

# 3. Update .env with your Supabase credentials

# 4. Start developing
pnpm run start:dev
```

**That's it!** The API will be available at `http://localhost:3000`

### Manual Setup (Alternative)

<details>
<summary>Click to expand manual setup steps</summary>

#### 1. Clone the Repository

```bash
git clone https://github.com/mdeadwiler/Back-End-FitTalk.git
cd Back-End-FitTalk
```

#### 2. Install Dependencies

```bash
pnpm install
```

#### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your credentials.

#### 4. Database Setup

Initialize Prisma and run migrations:

```bash
# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# (Optional) Seed the database
pnpm prisma db seed
```

#### 5. Start Development Server

```bash
pnpm run start:dev
```

The API will be available at `http://localhost:3000`

</details>

## Tech Stack

### Core Framework
- **NestJS** - Progressive Node.js framework
- **Fastify** - High-performance web server
- **TypeScript** - Type-safe JavaScript

### Database & ORM
- **PostgreSQL** (via Supabase)
- **Prisma** - Next-generation ORM

### Authentication
- **Supabase Auth** - Authentication & authorization
- **Passport** - Authentication middleware
- **JWT** - JSON Web Tokens
- **JWKS-RSA** - JWT verification

### Security & Performance
- **@fastify/helmet** - Security headers
- **@fastify/cors** - CORS handling
- **@fastify/compress** - Response compression
- **@nestjs/throttler** - Rate limiting

### Real-time & Scheduling
- **Socket.io** - WebSocket support
- **@nestjs/websockets** - WebSocket integration
- **@nestjs/schedule** - Task scheduling

### Caching & Queues
- **Redis** - In-memory data store
- **cache-manager** - Caching abstraction

### Validation & DTOs
- **class-validator** - Validation decorators
- **class-transformer** - Object transformation

### HTTP & Integrations
- **Axios** - HTTP client
- **@nestjs/axios** - Axios integration

## Available Scripts

```bash
# Development
pnpm run start:dev        # Start in watch mode
pnpm run start:debug      # Start in debug mode

# Production
pnpm run build            # Build for production
pnpm run start:prod       # Run production build

# Testing
pnpm run test             # Run unit tests
pnpm run test:watch       # Run tests in watch mode
pnpm run test:e2e         # Run end-to-end tests
pnpm run test:cov         # Generate test coverage

# Code Quality
pnpm run lint             # Run ESLint
pnpm run format           # Format code with Prettier

# Database
pnpm prisma studio        # Open Prisma Studio
pnpm prisma migrate dev   # Create and apply migrations
pnpm prisma generate      # Generate Prisma Client
```

## Project Structure

```
Back-End-FitTalk/
├── src/
│   ├── modules/          # Feature modules
│   ├── common/           # Shared utilities, guards, interceptors
│   ├── config/           # Configuration files
│   ├── main.ts           # Application entry point
│   └── app.module.ts     # Root module
├── prisma/
│   └── schema.prisma     # Database schema
├── test/                 # E2E tests
├── .env                  # Environment variables (create from .env.example)
└── package.json
```

## Development Workflow

1. **Create a new feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code patterns
   - Write tests for new features
   - Update documentation as needed

3. **Run quality checks**
   ```bash
   pnpm run lint
   pnpm run test
   pnpm run build
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**

## Docker Setup (Optional)

To run the application with Docker:

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down
```

## Contributing

1. Ensure all tests pass
2. Follow the existing code style
3. Update documentation for new features
4. Keep commits atomic and well-described

## Support

For questions or issues, please contact the development team or open an issue on GitHub.

## License

UNLICENSED - Private repository
