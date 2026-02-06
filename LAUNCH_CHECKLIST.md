# Mizano ERP - Production Launch Checklist

## Pre-Launch Verification

### Infrastructure Setup

- [ ] **Server Provisioning**
  - [ ] VPS/Cloud instance provisioned (min 2GB RAM, 2 vCPU recommended)
  - [ ] Ubuntu 22.04 LTS or similar installed
  - [ ] Docker and Docker Compose installed
  - [ ] Firewall configured (ports 80, 443 open)

- [ ] **Domain & SSL**
  - [ ] Domain registered and DNS configured
  - [ ] SSL certificate obtained (Let's Encrypt recommended)
  - [ ] HTTPS redirect configured in Nginx

- [ ] **Database**
  - [ ] PostgreSQL 16 installed/configured
  - [ ] Production database created
  - [ ] Database user with limited privileges
  - [ ] Automated backups configured (daily minimum)
  - [ ] Backup restoration tested

- [ ] **Redis**
  - [ ] Redis server installed/configured
  - [ ] Password authentication enabled
  - [ ] Persistence configured (RDB + AOF)
  - [ ] Memory limit set with eviction policy

---

### Environment Configuration

- [ ] **Create production `.env` file**
  ```bash
  cp .env.production.example .env.production
  ```

- [ ] **Generate secure secrets**
  ```bash
  # JWT secrets (64+ characters)
  openssl rand -base64 64

  # NextAuth secret (32+ characters)
  openssl rand -base64 32

  # Database password
  openssl rand -base64 24
  ```

- [ ] **Required environment variables set**
  - [ ] `DATABASE_URL` - PostgreSQL connection string
  - [ ] `REDIS_URL` - Redis connection string
  - [ ] `JWT_SECRET` - Unique, 64+ character random string
  - [ ] `JWT_REFRESH_SECRET` - Different from JWT_SECRET
  - [ ] `NEXTAUTH_SECRET` - Unique, 32+ character random string
  - [ ] `NEXTAUTH_URL` - Production URL (https://yourdomain.com)
  - [ ] `NEXT_PUBLIC_API_URL` - API URL (https://api.yourdomain.com or https://yourdomain.com/api)
  - [ ] `NODE_ENV=production`

- [ ] **Optional but recommended**
  - [ ] `SMTP_*` variables for email sending
  - [ ] `SENTRY_DSN` for error tracking
  - [ ] Rate limiting configuration

---

### Database Setup

- [ ] **Run migrations**
  ```bash
  docker-compose -f docker-compose.production.yml run --rm api npx prisma migrate deploy
  ```

- [ ] **Verify schema**
  ```bash
  docker-compose -f docker-compose.production.yml run --rm api npx prisma db pull --print
  ```

- [ ] **Create initial admin user** (if not using seed)
  - Via API or manual database insert

---

### Security Checklist

- [ ] **Authentication**
  - [ ] JWT tokens have reasonable expiration (15m access, 7d refresh)
  - [ ] Refresh token rotation enabled
  - [ ] Password hashing uses bcrypt with cost factor 12+

- [ ] **API Security**
  - [ ] CORS configured for production domain only
  - [ ] Rate limiting enabled (10 req/s general, 5 req/min auth)
  - [ ] Helmet.js security headers enabled
  - [ ] Input validation on all endpoints (class-validator)

- [ ] **Data Security**
  - [ ] Multi-tenancy isolation verified (organizationId in all queries)
  - [ ] SQL injection prevention (Prisma parameterized queries)
  - [ ] XSS protection enabled
  - [ ] CSRF protection for forms

- [ ] **Infrastructure Security**
  - [ ] SSH key-only authentication (password disabled)
  - [ ] Non-root user for application
  - [ ] Automatic security updates enabled
  - [ ] fail2ban or similar installed

---

### Application Deployment

- [ ] **Build images**
  ```bash
  docker-compose -f docker-compose.production.yml build
  ```

- [ ] **Start services**
  ```bash
  docker-compose -f docker-compose.production.yml up -d
  ```

- [ ] **Verify services running**
  ```bash
  docker-compose -f docker-compose.production.yml ps
  ```

- [ ] **Check logs for errors**
  ```bash
  docker-compose -f docker-compose.production.yml logs -f
  ```

---

### Health Checks

- [ ] **API health endpoint**
  ```bash
  curl https://api.yourdomain.com/health
  # Should return: {"status":"healthy","services":{"database":{"status":"connected"}}}
  ```

- [ ] **Web application loads**
  - [ ] Homepage accessible
  - [ ] Login page works
  - [ ] Static assets load correctly

- [ ] **Database connectivity**
  - [ ] Can create test organization
  - [ ] Can create test user
  - [ ] Queries return data

---

### Functional Testing

- [ ] **Authentication Flow**
  - [ ] User registration works
  - [ ] Login returns tokens
  - [ ] Token refresh works
  - [ ] Logout invalidates tokens

- [ ] **Core Modules**
  - [ ] Dashboard loads with data
  - [ ] Chart of Accounts CRUD works
  - [ ] Journal entries create & balance
  - [ ] Invoices create & send
  - [ ] Bills create & pay
  - [ ] Banking reconciliation works
  - [ ] Reports generate correctly

- [ ] **AI Features**
  - [ ] Transaction categorization suggests
  - [ ] Cash flow prediction displays
  - [ ] Anomaly detection runs
  - [ ] AI alerts appear on dashboard

- [ ] **Multi-tenancy**
  - [ ] Create two test organizations
  - [ ] Verify data isolation between orgs
  - [ ] User cannot access other org's data

---

### Performance Verification

- [ ] **Response times**
  - [ ] API endpoints respond < 500ms
  - [ ] Dashboard loads < 3 seconds
  - [ ] Reports generate < 5 seconds

- [ ] **Load testing** (optional but recommended)
  ```bash
  # Using hey or similar
  hey -n 1000 -c 50 https://api.yourdomain.com/health
  ```

- [ ] **Database performance**
  - [ ] Indexes verified on common query columns
  - [ ] Query execution plans checked

---

### Monitoring & Logging

- [ ] **Application logging**
  - [ ] Logs written to persistent volume
  - [ ] Log rotation configured
  - [ ] Error logs monitored

- [ ] **System monitoring** (recommended)
  - [ ] Uptime monitoring (UptimeRobot, Pingdom, etc.)
  - [ ] Resource usage alerts (CPU, memory, disk)
  - [ ] Database connection pool monitoring

- [ ] **Error tracking** (recommended)
  - [ ] Sentry or similar configured
  - [ ] Source maps uploaded
  - [ ] Alert notifications enabled

---

### Backup & Recovery

- [ ] **Automated backups**
  - [ ] Database backup script scheduled (cron)
  - [ ] Backups stored offsite (S3, GCS, etc.)
  - [ ] Retention policy defined (30 days minimum)

- [ ] **Backup testing**
  - [ ] Restore backup to test environment
  - [ ] Verify data integrity after restore

- [ ] **Disaster recovery plan**
  - [ ] RTO/RPO defined
  - [ ] Recovery procedures documented

---

### Documentation

- [ ] **User documentation**
  - [ ] Getting started guide
  - [ ] Feature documentation
  - [ ] FAQ/troubleshooting

- [ ] **Operations documentation**
  - [ ] Deployment procedures
  - [ ] Backup/restore procedures
  - [ ] Incident response plan
  - [ ] On-call contacts

---

### Final Verification

- [ ] **Smoke test by non-developer**
  - [ ] Register new account
  - [ ] Complete onboarding wizard
  - [ ] Create invoice
  - [ ] Record expense
  - [ ] View reports

- [ ] **Communication**
  - [ ] Support email configured and tested
  - [ ] Status page setup (optional)

---

## Post-Launch

### Day 1 Monitoring

- [ ] Watch error logs for issues
- [ ] Monitor server resources
- [ ] Check database connection pool
- [ ] Verify scheduled jobs running

### Week 1 Tasks

- [ ] Review error reports
- [ ] Address any performance issues
- [ ] Gather initial user feedback
- [ ] Document any issues found

### Ongoing Maintenance

- [ ] Weekly backup verification
- [ ] Monthly security updates
- [ ] Quarterly dependency updates
- [ ] Annual security audit

---

## Quick Commands Reference

```bash
# Start production services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f api
docker-compose -f docker-compose.production.yml logs -f web

# Restart a service
docker-compose -f docker-compose.production.yml restart api

# Run database migration
docker-compose -f docker-compose.production.yml run --rm api npx prisma migrate deploy

# Database backup
docker-compose -f docker-compose.production.yml exec postgres pg_dump -U mizano mizano_db > backup_$(date +%Y%m%d).sql

# Check service health
curl -s http://localhost:3001/health | jq

# View resource usage
docker stats

# Pull latest images
docker-compose -f docker-compose.production.yml pull

# Update services with zero downtime
docker-compose -f docker-compose.production.yml up -d --no-deps api
docker-compose -f docker-compose.production.yml up -d --no-deps web
```

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps | [TBD] | [TBD] |
| Developer | [TBD] | [TBD] |
| Business | [TBD] | [TBD] |

---

## Rollback Procedure

If critical issues are found after deployment:

1. **Stop new traffic** (if using load balancer)
2. **Identify the issue** in logs
3. **Rollback to previous version**
   ```bash
   docker-compose -f docker-compose.production.yml pull api:previous-tag
   docker-compose -f docker-compose.production.yml up -d --no-deps api
   ```
4. **Verify rollback successful**
5. **Document the issue** for investigation

---

*Last Updated: $(date)*
*Version: 1.0.0*
