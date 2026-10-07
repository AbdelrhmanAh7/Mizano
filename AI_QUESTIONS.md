# Questions for Coordinator

## Schema Change Request
Issue: #105
Requested by: AI Implementer

Please add the following index to the `EmailLog` model in `prisma/schema.prisma` to optimize the daily volume anomaly check query:
```prisma
@@index([organizationId, entityType, sentAt])
```

The anomaly check logic has been implemented and uses the existing `@@index([organizationId, entityType, entityId])` index in the meantime. The system will function correctly, but the requested index is needed for better performance.
