-- Allow the server connection to assume the scoped reader; no inherited or browser grants.
grant training_preview_reader to postgres with inherit false, set true;
