#!/bin/bash

set -e

echo "🚀 FitTalk Backend Setup Script"
echo "================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm is not installed. Installing pnpm..."
    npm install -g pnpm
fi
echo "✅ pnpm $(pnpm -v)"

# Check Docker (optional)
if command -v docker &> /dev/null; then
    echo "✅ Docker $(docker -v)"
else
    echo "⚠️  Docker not found (optional)"
fi

echo ""
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "📝 Setting up environment variables..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
        echo "⚠️  Please update .env with your credentials before continuing"
    else
        echo "⚠️  No .env.example found. You'll need to create .env manually"
    fi
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🗄️  Setting up database..."
if [ -f .env ]; then
    # Generate Prisma client
    echo "Generating Prisma client..."
    pnpm prisma generate
    
    # Ask if user wants to run migrations
    read -p "Do you want to run database migrations now? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pnpm prisma migrate dev
        echo "✅ Database migrations completed"
    else
        echo "⚠️  Skipped migrations. Run 'pnpm prisma migrate dev' when ready"
    fi
else
    echo "⚠️  Skipping database setup. Configure .env first, then run 'pnpm prisma generate'"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your credentials"
echo "2. Run 'pnpm prisma migrate dev' to setup the database"
echo "3. Run 'pnpm run start:dev' to start the development server"
echo ""
echo "Happy coding! 🎉"
