import Joi from 'joi';

// Document upload validation
const documentSchema = Joi.object({
  mimetype: Joi.string().valid('application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').required(),
  size: Joi.number().max(50 * 1024 * 1024).required() // 50MB max
});

export function validateDocument(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { error } = documentSchema.validate({
    mimetype: req.file.mimetype,
    size: req.file.size
  });

  if (error) {
    return res.status(400).json({ 
      error: 'Invalid file',
      details: error.details[0].message 
    });
  }

  next();
}

// Search validation
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(1000).required(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  documents: Joi.array().items(Joi.string().uuid()).default([]),
  threshold: Joi.number().min(0).max(1).default(0.7)
});

export function validateSearch(req, res, next) {
  const { error, value } = searchSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Invalid search parameters',
      details: error.details[0].message
    });
  }

  req.body = value;
  next();
}

// Chat validation
const chatSchema = Joi.object({
  message: Joi.string().min(1).max(5000).required(),
  use_documents: Joi.boolean().default(true),
  document_ids: Joi.array().items(Joi.string().uuid()).default([])
});

export function validateChat(req, res, next) {
  const { error, value } = chatSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Invalid chat parameters',
      details: error.details[0].message
    });
  }

  req.body = value;
  next();
}