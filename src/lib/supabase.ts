import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://rbhhtibdaznvfzsqvaka.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjcyNDY0ZDJlLTc2NjQtNDgxMi1iYmNmLTA0NzJmMzRhZjRlMCJ9.eyJwcm9qZWN0SWQiOiJyYmhodGliZGF6bnZmenNxdmFrYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY4ODg4NTE1LCJleHAiOjIwODQyNDg1MTUsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.wsmBnExlsuJfAB_tqdcTj0O9HDgkuVr-fF38YphA_v0';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };