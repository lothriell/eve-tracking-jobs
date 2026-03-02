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

echo ""
echo "✅ v3.0.9 deployed!"
echo "Visit: http://10.69.10.15:9000"
echo "Blueprint images and filtering fixed!"
