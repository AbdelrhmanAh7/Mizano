# Mizano Pi 5 Development Guide

## Quick Start

To run the full stack on your Raspberry Pi 5:
1. Ensure you have a USB SSD connected and formatted
2. Mount the SSD to `/data` (see below for setup)
3. Configure your environment variables in `.env.pi`
4. Run `docker compose -f docker-compose.pi.yml up -d`

## SSD Setup

Mount your USB SSD to the `/data` directory:
```bash
docker volume create data

# For Raspberry Pi with USB SSD:
sudo mount /dev/sda1 /mnt/data
sudo chown -R root:root /mnt/data
sudo mv /mnt/data /data

# For macOS/Linux development:
sudo mount -t vboxsf <shared_folder> /data
```

## Memory Configuration

The Docker Compose file enforces these memory limits:
- PostgreSQL: 1.5GB
- Redis: 256MB
- API: 1GB
- Web: 512MB
- Worker: 2GB
- Proxy: 128MB

## Monitoring

Check system resources with:
```bash
docker stats
free -h
```

## Reboot Recovery

All services will automatically restart after a reboot thanks to Docker's health checks and restart policies.

## Environment Variables

Required variables in `.env.pi`:
- `DB_PASSWORD` (PostgreSQL password)
- `REDIS_PASSWORD` (Redis password)

Optional variables:
- `POSTGRES_SHARED_BUFFERS`
- `POSTGRES_WORK_MEM`
- `POSTGRES_MAX_CONNECTIONS`
- `POSTGRES_LOG_LINE_FORMAT`
- `POSTGRES_LOG_MIN_MESSAGES`
- `POSTGRES_LOG_FILE`
- `REDIS_MAXMEMORY`
- `REDIS_MAXMEMORYPOLICY`