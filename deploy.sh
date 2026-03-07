#bash
cd ~/docker/eve_esi_app

# Pull fix
git pull origin main

# Rebuild
docker-compose down
docker-compose up -d --build

# Wait for startup
sleep 30

# Check status
docker-compose ps
docker-compose logs backend | tail -20
