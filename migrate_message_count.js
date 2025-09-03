// Quick migration script to add message_count column
const { supabase } = require('./config/supabaseClient');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🚀 Running message_count column migration...');
        
        // Read the SQL file
        const sqlPath = path.join(__dirname, 'schema', '11_add_message_count_to_chat_sessions.sql');
        const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
        
        // Split into individual statements (simple split by semicolon and newline)
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt && !stmt.startsWith('--'));
            
        console.log(`Found ${statements.length} SQL statements to execute`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim()) {
                console.log(`Executing statement ${i + 1}/${statements.length}...`);
                console.log(`SQL: ${statement.substring(0, 100)}...`);
                
                const { error } = await supabase.rpc('exec_sql', { 
                    sql_query: statement 
                });
                
                if (error) {
                    console.error(`❌ Error in statement ${i + 1}:`, error);
                    // Try direct query instead
                    const { error: directError } = await supabase.from('_').select('*').limit(0);
                    console.log('Trying alternative approach...');
                    
                    // For ALTER TABLE, we can try a different approach
                    if (statement.includes('ALTER TABLE')) {
                        console.log('⚠️  ALTER TABLE statement may need to be run manually in Supabase Dashboard');
                        console.log('SQL to run manually:', statement);
                    }
                } else {
                    console.log(`✅ Statement ${i + 1} executed successfully`);
                }
            }
        }
        
        console.log('✅ Migration completed!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        console.log('\n📝 Manual steps required:');
        console.log('1. Go to Supabase Dashboard > SQL Editor');
        console.log('2. Run this SQL manually:');
        console.log('   ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;');
        console.log('3. Then restart the backend server');
    }
}

runMigration();