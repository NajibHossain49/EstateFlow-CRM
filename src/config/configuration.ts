export interface AppConfig {
  nodeEnv: string;
  port: number;
  version: string;
  corsOrigin: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  version: process.env.npm_package_version ?? '1.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'super-secret-change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
});
