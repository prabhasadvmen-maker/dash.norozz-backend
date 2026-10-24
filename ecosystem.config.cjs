module.exports = {
  apps: [
    {
      name: 'norozz-api',
      script: 'src/server.js',
      cwd: '/home/ubuntu/Norozz1/Api_norozz',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
