module.exports = {
  apps: [
    {
      name: 'clockin-lite',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      cwd: '/www/wwwroot/clockin-lite',
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
