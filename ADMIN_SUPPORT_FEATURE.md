# Admin & Support System Feature

## Overview

Comprehensive admin and support ticket system for the FitTalk fitness application backend. This feature provides role-based access control, user management, system monitoring, and customer support ticketing functionality.

## 🎯 Features

### Role-Based Access Control (RBAC)
- **Three-tier role hierarchy**: ADMIN > SUPPORT > USER
- Declarative role authorization with `@Roles()` decorator
- Centralized enforcement via `RolesGuard`
- Automatic role validation on all protected endpoints

### Admin Module
- **User Management**
  - List users with pagination and filters
  - View detailed user information and statistics
  - Suspend/unsuspend user accounts
  - Change user roles (promote/demote)
  - Permanently delete users (with safeguards)
- **System Monitoring**
  - Real-time system statistics
  - User activity metrics
  - Support ticket analytics
  - Database and Redis health checks
- **Audit Logging**
  - Search and filter audit logs
  - Track all admin actions
  - Compliance and security monitoring

### Support Module
- **Ticket Management**
  - Create support tickets (users)
  - List and filter tickets (role-based)
  - View ticket details with message threads
  - Update ticket status, priority, and assignments
  - Internal notes for staff communication
  - Activity tracking for all changes
- **Workflow States**
  - OPEN → IN_PROGRESS → WAITING_FOR_USER/WAITING_FOR_SUPPORT → RESOLVED → CLOSED
  - Automatic status transitions based on responder
  - Tag-based organization

## 📂 Project Structure

```
src/
├── common/
│   ├── enums/
│   │   └── role.enum.ts              # Role enumeration and helpers
│   ├── decorators/
│   │   └── roles.decorator.ts        # @Roles() decorator
│   ├── guards/
│   │   ├── roles.guard.ts            # Role authorization guard
│   │   └── throttler/
│   │       ├── throttler.config.ts   # Rate limit configurations (14 new limits)
│   │       └── throttler.decorators.ts # Rate limit decorators
│   └── ...
├── modules/
│   ├── admin/
│   │   ├── admin.controller.ts       # 8 admin endpoints
│   │   ├── admin.service.ts          # Admin business logic
│   │   ├── admin.module.ts           # Module configuration
│   │   └── dtos/                     # Request/Response DTOs
│   │       ├── user-management.dto.ts
│   │       ├── system-stats.dto.ts
│   │       ├── audit-log.dto.ts
│   │       └── index.ts
│   ├── support/
│   │   ├── support.controller.ts     # 6 support endpoints
│   │   ├── support.service.ts        # Support business logic
│   │   ├── support.module.ts         # Module configuration
│   │   └── dtos/                     # Request/Response DTOs
│   │       ├── ticket.dto.ts
│   │       └── index.ts
│   └── auth/
│       └── strategies/
│           └── jwt.strategy.ts       # Enhanced with role and suspension checks
└── prisma/
    └── schema.prisma                 # Database schema with new models
```

## 🗄️ Database Schema

### Enhanced User Model
```prisma
model User {
  // Existing fields...
  role                   Role                  @default(USER)
  suspendedAt            DateTime?
  suspendedReason        String?
  suspendedBy            String?
  // New relations...
  supportTicketsCreated  SupportTicket[]       @relation("TicketCreator")
  supportTicketsAssigned SupportTicket[]       @relation("TicketAssignee")
  ticketMessages         TicketMessage[]
  ticketActivities       TicketActivity[]
}
```

### New Models
- **SupportTicket**: Main ticket entity with auto-incrementing ticket numbers
- **TicketMessage**: Message thread with internal note support
- **TicketActivity**: Audit trail for ticket changes

### New Enums
- **Role**: ADMIN, SUPPORT, USER
- **TicketCategory**: TECHNICAL_ISSUE, ACCOUNT_ISSUE, BILLING, FEATURE_REQUEST, BUG_REPORT, GENERAL_INQUIRY, OTHER
- **TicketPriority**: LOW, MEDIUM, HIGH, URGENT
- **TicketStatus**: OPEN, IN_PROGRESS, WAITING_FOR_USER, WAITING_FOR_SUPPORT, RESOLVED, CLOSED

## 🔒 Security Features

### Authorization
- **JWT-based authentication** (existing)
- **Role-based access control** with `RolesGuard`
- **Ownership validation** for user data access
- **Account suspension** blocks access at JWT validation level

### Rate Limiting
All endpoints protected with Redis-backed distributed rate limiting:
- Admin endpoints: 5-100 requests/minute based on sensitivity
- Support endpoints: 5-100 requests/minute based on operation
- Environment-aware (10x in dev, unlimited in test)

### Audit Logging
- All admin mutations logged via `AuditLoggingInterceptor`
- All ticket changes recorded in `TicketActivity`
- Searchable audit trail for compliance

### Input Sanitization
- Global `SanitizationPipe` on all endpoints
- XSS prevention
- SQL injection protection (via Prisma)

## 📡 API Endpoints

### Admin Endpoints (`/api/v1/admin`)
All require `ADMIN` role.

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/users` | List users with filters | 30/min |
| GET | `/users/:id` | Get user details | 100/min |
| POST | `/users/:id/suspend` | Suspend user account | 10/min |
| POST | `/users/:id/unsuspend` | Restore user account | 10/min |
| PATCH | `/users/:id/role` | Update user role | 10/min |
| DELETE | `/users/:id` | Permanently delete user | 5/min |
| GET | `/stats` | Get system statistics | 60/min |
| GET | `/audit-logs` | Search audit logs | 50/min |

### Support Endpoints (`/api/v1/support/tickets`)
Role-based access control.

| Method | Endpoint | Access | Description | Rate Limit |
|--------|----------|--------|-------------|------------|
| POST | `/` | All | Create ticket | 5/min |
| GET | `/` | All | List tickets (filtered by role) | 100/min |
| GET | `/:id` | Owner/Staff | Get ticket details | 100/min |
| PATCH | `/:id` | SUPPORT/ADMIN | Update ticket | 30/min |
| POST | `/:id/messages` | Owner/Staff | Add message | 50/min |
| POST | `/:id/close` | Owner/Staff | Close ticket | 30/min |

## 🚀 Deployment

### Prerequisites
- PostgreSQL database
- Redis instance (for rate limiting)
- Node.js 18+ and pnpm

### Installation Steps

1. **Install dependencies** (if not already done):
   ```bash
   pnpm install
   ```

2. **Run database migration**:
   ```bash
   npx prisma db push
   ```

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Create first admin user**:
   ```sql
   UPDATE "User"
   SET role = 'ADMIN'
   WHERE email = 'your-admin@example.com';
   ```

5. **Start the application**:
   ```bash
   # Development
   pnpm run start:dev

   # Production
   pnpm run build
   pnpm run start:prod
   ```

### Environment Variables

Ensure these are set in `.env`:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# Supabase (for JWT)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_JWT_SECRET="your-jwt-secret"

# Redis (for rate limiting)
REDIS_URL="redis://localhost:6379"

# App settings
NODE_ENV="development"  # or "production"
APP_NAME="fittalk"      # Optional, for Redis namespacing
```

## 🧪 Testing

### Creating Test Users

```typescript
// Create ADMIN user
await prisma.user.update({
  where: { email: 'admin@example.com' },
  data: { role: 'ADMIN' }
});

// Create SUPPORT user
await prisma.user.update({
  where: { email: 'support@example.com' },
  data: { role: 'SUPPORT' }
});
```

### Testing Admin Endpoints

```bash
# Get JWT token first
TOKEN="your_jwt_token"

# List users
curl -X GET http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $TOKEN"

# Get system stats
curl -X GET http://localhost:3000/api/v1/admin/stats \
  -H "Authorization: Bearer $TOKEN"

# Suspend user
curl -X POST http://localhost:3000/api/v1/admin/users/{userId}/suspend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Testing suspension"}'
```

### Testing Support Endpoints

```bash
# Create ticket (any user)
curl -X POST http://localhost:3000/api/v1/support/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Need help",
    "category": "TECHNICAL_ISSUE",
    "message": "I cannot log workouts"
  }'

# List tickets (users see only their own)
curl -X GET http://localhost:3000/api/v1/support/tickets \
  -H "Authorization: Bearer $TOKEN"

# Add message to ticket
curl -X POST http://localhost:3000/api/v1/support/tickets/{ticketId}/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Additional information..."}'
```

## 📊 Usage Examples

### Admin: User Management

```typescript
// List all suspended users
GET /admin/users?suspendedOnly=true&page=1&limit=20

// Get user details with activity stats
GET /admin/users/{userId}

// Promote user to SUPPORT
PATCH /admin/users/{userId}/role
Body: { "role": "SUPPORT" }

// Suspend user
POST /admin/users/{userId}/suspend
Body: { "reason": "Violation of terms of service" }
```

### Admin: System Monitoring

```typescript
// Get system statistics
GET /admin/stats

// Response includes:
{
  "users": {
    "total": 1523,
    "active": 842,
    "suspended": 12,
    "newThisMonth": 87,
    "byRole": { "USER": 1500, "SUPPORT": 20, "ADMIN": 3 }
  },
  "activity": {
    "totalWorkoutLogs": 15234,
    "totalMealLogs": 23456,
    "totalGoals": 3456,
    "totalConsultations": 1234,
    "activeSessionsCount": 15
  },
  "support": {
    "totalTickets": 456,
    "openTickets": 23,
    "resolvedTickets": 398
  },
  "system": {
    "databaseStatus": "healthy",
    "redisStatus": "healthy",
    "uptimeSeconds": 345678
  }
}
```

### Support: Ticket Management

```typescript
// User creates ticket
POST /support/tickets
Body: {
  "subject": "Cannot sync workout data",
  "category": "TECHNICAL_ISSUE",
  "message": "My workout logs from yesterday are not showing up..."
}

// Support staff views unassigned tickets
GET /support/tickets?unassignedOnly=true&status=OPEN

// Support assigns ticket to themselves and changes priority
PATCH /support/tickets/{ticketId}
Body: {
  "assigneeId": "{supportUserId}",
  "priority": "HIGH",
  "status": "IN_PROGRESS"
}

// Support adds internal note (not visible to user)
POST /support/tickets/{ticketId}/messages
Body: {
  "message": "Checked database - issue is on server side. Escalating to dev team.",
  "isInternal": true
}

// Support replies to user
POST /support/tickets/{ticketId}/messages
Body: {
  "message": "Thank you for reporting this. We've identified the issue and are working on a fix..."
}

// Mark as resolved
PATCH /support/tickets/{ticketId}
Body: { "status": "RESOLVED" }

// User confirms and closes
POST /support/tickets/{ticketId}/close
```

## 🔍 Key Design Decisions

### 1. Role-Based Access Control
- **Why**: Simple three-tier model covers all use cases while remaining easy to manage
- **Implementation**: Database-stored roles (source of truth) + JWT strategy validation + RolesGuard
- **Benefits**: Clear separation of permissions, easy to audit, scalable

### 2. Database-First Roles
- **Why**: Roles stored in database rather than just JWT tokens
- **Benefits**: Can be changed without re-issuing tokens, single source of truth, audit trail
- **Trade-off**: One additional database lookup per request (cached in JWT strategy)

### 3. Service-Based Architecture
- **Why**: Business logic in services, controllers handle HTTP concerns only
- **Benefits**: Testable, reusable, follows NestJS best practices
- **Pattern**: Controller → Service → Prisma

### 4. Comprehensive DTOs
- **Why**: Type-safe request/response validation with class-validator and class-transformer
- **Benefits**: Automatic validation, serialization control, Swagger documentation
- **Pattern**: Separate DTOs for requests and responses

### 5. Activity Tracking
- **Why**: All mutations logged, ticket changes recorded
- **Benefits**: Audit compliance, debugging, user transparency
- **Implementation**: AuditLoggingInterceptor + TicketActivity model

### 6. Internal Notes
- **Why**: Support staff need private communication channel
- **Benefits**: Collaboration without exposing to users, better service quality
- **Implementation**: `isInternal` flag on TicketMessage, filtered in queries

## 🚨 Important Safeguards

### Admin Operations
- ❌ Cannot suspend yourself
- ❌ Cannot delete yourself
- ❌ Cannot suspend other admins
- ❌ Cannot delete other admins
- ❌ Cannot demote yourself from ADMIN role
- ✅ All operations logged to audit trail

### Support Operations
- ✅ Users can only see their own tickets
- ✅ Users cannot create internal notes
- ✅ Support/Admin can see all tickets
- ✅ Automatic status transitions prevent manual errors
- ✅ All changes tracked in activity log

### Account Suspension
- ✅ Suspended users blocked at JWT validation (cannot bypass)
- ✅ Suspension reason recorded
- ✅ Admin who suspended is tracked
- ✅ Can be reversed by any admin

## 📈 Performance Considerations

### Pagination
- All list endpoints support pagination (default: 20 items)
- Maximum page size: 100 items
- Database queries optimized with indexes

### Rate Limiting
- Redis-backed for horizontal scalability
- Per-user tracking (not just IP)
- Environment-aware limits

### Database Indexes
- `User.role` indexed for role filtering
- `User.email` indexed for search
- `SupportTicket` composite indexes on status+priority, userId, assigneeId
- `TicketMessage` indexed on ticketId+createdAt

## 🐛 Troubleshooting

### Issue: 403 Forbidden on admin endpoints
**Solution**: Verify user's role is `ADMIN` in database and JWT token is fresh

### Issue: Suspended user can still access API
**Solution**: Ensure user logs out and logs back in (JWT needs to be re-validated)

### Issue: Internal notes visible to users
**Solution**: Check query filters in `getTicket()` - should exclude `isInternal: true` for USER role

### Issue: Rate limit too strict in development
**Solution**: Check `NODE_ENV` is set to `development` (gets 10x limits)

## 📚 Related Documentation

- [Rate Limiting Implementation Guide](src/common/guards/throttler/README.md)
- [Prisma Schema](prisma/schema.prisma)
- [API Documentation](http://localhost:3000/api) - Swagger UI when running

## 🎯 Future Enhancements

### Planned Features
- [ ] Ticket attachments (file uploads)
- [ ] Email notifications for ticket updates
- [ ] Ticket templates for common issues
- [ ] SLA tracking and reporting
- [ ] Bulk user operations (bulk suspend, bulk role change)
- [ ] Advanced audit log analytics
- [ ] User impersonation (for debugging)
- [ ] Two-factor authentication for admin accounts

### Optimization Opportunities
- [ ] Cache system statistics (Redis)
- [ ] Implement cursor-based pagination for large datasets
- [ ] Add full-text search for tickets
- [ ] Implement ticket auto-assignment algorithm
- [ ] Add metrics collection (Prometheus/Grafana)

## 👥 Contributors

Built by senior backend engineers following enterprise-grade patterns and best practices.

## 📄 License

Part of the FitTalk fitness application backend. All rights reserved.
