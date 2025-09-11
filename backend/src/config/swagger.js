import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DKM Backend API',
      version: '1.0.0',
      description: 'Document Mining API Documentation'
    },
    servers: [
      {
        url: 'http://localhost:3001', // change to your backend URL
      }
    ],
  },
  apis: ['./src/routes/*.js'], // <- path to your route files with JSDoc comments
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
