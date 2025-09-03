// Environment Variable Validation for Production Readiness
// Validates critical environment variables on app startup

const requiredEnvVars = {
  // Stripe Configuration
  STRIPE_SECRET_KEY: {
    description: 'Stripe Secret Key for payment processing',
    pattern: /^sk_(test_|live_).+/,
    required: true
  },
  STRIPE_WEBHOOK_SECRET: {
    description: 'Stripe Webhook Secret for signature verification',
    pattern: /^whsec_.+/,
    required: true
  },
  
  // Frontend Configuration
  FRONTEND_URL: {
    description: 'Frontend URL for redirects and CORS',
    pattern: /^https?:\/\/.+/,
    required: true
  },
  
  // Database Configuration
  SUPABASE_URL: {
    description: 'Supabase project URL',
    pattern: /^https:\/\/.+\.supabase\.co$/,
    required: true
  },
  SUPABASE_KEY: {
    description: 'Supabase anonymous/public key',
    pattern: /^eyJ.+/,
    required: true
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    description: 'Supabase service role key (for admin operations)',
    pattern: /^eyJ.+/,
    required: true
  }
};

const optionalEnvVars = {
  // CORS Configuration
  CORS_ORIGIN: {
    description: 'Allowed CORS origins (comma-separated)',
    required: false
  },
  
  // Port Configuration
  PORT: {
    description: 'Server port',
    pattern: /^\d{4,5}$/,
    required: false,
    defaultValue: '3000'
  }
};

function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  const errors = [];
  const warnings = [];
  
  // Check required environment variables
  Object.entries(requiredEnvVars).forEach(([key, config]) => {
    const value = process.env[key];
    
    if (!value) {
      errors.push(`❌ Missing required environment variable: ${key} (${config.description})`);
      return;
    }
    
    // Validate pattern if provided
    if (config.pattern && !config.pattern.test(value)) {
      errors.push(`❌ Invalid format for ${key}: Expected pattern ${config.pattern} (${config.description})`);
      return;
    }
    
    // Mask sensitive values in logs
    const maskedValue = key.includes('KEY') || key.includes('SECRET') 
      ? value.substring(0, 8) + '...' + value.substring(value.length - 4)
      : value;
    
    console.log(`✅ ${key}: ${maskedValue}`);
  });
  
  // Check optional environment variables
  Object.entries(optionalEnvVars).forEach(([key, config]) => {
    const value = process.env[key];
    
    if (!value) {
      if (config.defaultValue) {
        process.env[key] = config.defaultValue;
        console.log(`⚠️ ${key}: Using default value "${config.defaultValue}"`);
      } else {
        warnings.push(`⚠️ Optional environment variable not set: ${key} (${config.description})`);
      }
      return;
    }
    
    // Validate pattern if provided
    if (config.pattern && !config.pattern.test(value)) {
      warnings.push(`⚠️ Invalid format for optional ${key}: Expected pattern ${config.pattern} (${config.description})`);
      return;
    }
    
    console.log(`✅ ${key}: ${value}`);
  });
  
  // Print warnings
  warnings.forEach(warning => console.log(warning));
  
  // Handle errors
  if (errors.length > 0) {
    console.error('\n🚨 ENVIRONMENT VALIDATION FAILED:');
    errors.forEach(error => console.error(error));
    console.error('\n💡 Please check your .env file and ensure all required variables are set correctly.');
    console.error('📖 Refer to the documentation for environment variable setup instructions.\n');
    process.exit(1);
  }
  
  // Stripe environment check
  const isProduction = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
  const environment = isProduction ? '🔴 LIVE' : '🟡 TEST';
  console.log(`\n💳 Stripe Mode: ${environment}`);
  
  if (isProduction) {
    console.log('⚠️  PRODUCTION MODE: Real payments will be processed!');
  }
  
  console.log('✅ Environment validation completed successfully\n');
}

// Additional runtime validation for Stripe connection
async function validateStripeConnection() {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    console.log('🔗 Testing Stripe connection...');
    
    // Test API connection by retrieving account info
    const account = await stripe.accounts.retrieve();
    
    console.log(`✅ Stripe connected successfully`);
    console.log(`   Account: ${account.display_name || account.email || 'N/A'}`);
    console.log(`   Country: ${account.country}`);
    console.log(`   Currency: ${account.default_currency?.toUpperCase()}`);
    
  } catch (error) {
    console.error('❌ Stripe connection failed:', error.message);
    console.error('💡 Please verify your STRIPE_SECRET_KEY is correct and has proper permissions.');
    process.exit(1);
  }
}

module.exports = {
  validateEnvironment,
  validateStripeConnection
};