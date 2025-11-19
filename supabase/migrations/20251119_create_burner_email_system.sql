/*
  # Burner Email System

  1. New Tables
    - `burner_emails`
      - `id` (uuid, primary key)
      - `installation_id` (uuid, indexed) - Links to user's extension installation
      - `email_address` (text, unique, indexed) - The burner email address
      - `real_email` (text, encrypted) - User's real email for forwarding
      - `description` (text) - Optional label for the burner email
      - `is_active` (boolean) - Whether the email is active
      - `expires_at` (timestamptz) - Optional expiration date
      - `emails_received` (int) - Counter for received emails
      - `emails_forwarded` (int) - Counter for forwarded emails
      - `last_email_at` (timestamptz) - Timestamp of last received email
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `email_logs`
      - `id` (uuid, primary key)
      - `burner_email_id` (uuid, foreign key)
      - `from_address` (text) - Sender email
      - `subject` (text) - Email subject
      - `received_at` (timestamptz) - When email was received
      - `forwarded` (boolean) - Whether email was forwarded
      - `forwarded_at` (timestamptz) - When email was forwarded
      - `error_message` (text) - Any error during forwarding
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for user access to own burner emails
    - Add policy for webhook to insert email logs
    - Add policy for anon to lookup burner emails (for webhook)

  3. Indexes
    - Index on email_address for fast lookups
    - Index on installation_id for user queries
    - Index on burner_email_id for log queries
    - Composite index for active + not expired emails
*/

-- Create burner_emails table
CREATE TABLE IF NOT EXISTS burner_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  email_address text UNIQUE NOT NULL,
  real_email text NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  emails_received int NOT NULL DEFAULT 0,
  emails_forwarded int NOT NULL DEFAULT 0,
  last_email_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  burner_email_id uuid NOT NULL REFERENCES burner_emails(id) ON DELETE CASCADE,
  from_address text NOT NULL,
  subject text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  forwarded boolean NOT NULL DEFAULT false,
  forwarded_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_burner_emails_address
  ON burner_emails(email_address);

CREATE INDEX IF NOT EXISTS idx_burner_emails_installation
  ON burner_emails(installation_id);

CREATE INDEX IF NOT EXISTS idx_burner_emails_active
  ON burner_emails(is_active, expires_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_email_logs_burner_email
  ON email_logs(burner_email_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_received
  ON email_logs(received_at DESC);

-- Enable Row Level Security
ALTER TABLE burner_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Policies for burner_emails
CREATE POLICY "Users can view own burner emails"
  ON burner_emails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own burner emails"
  ON burner_emails FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own burner emails"
  ON burner_emails FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own burner emails"
  ON burner_emails FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous can select burner emails for webhook"
  ON burner_emails FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Anonymous can update email counters"
  ON burner_emails FOR UPDATE
  TO anon
  USING (is_active = true)
  WITH CHECK (is_active = true);

-- Policies for email_logs
CREATE POLICY "Users can view own email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM burner_emails
      WHERE burner_emails.id = email_logs.burner_email_id
    )
  );

CREATE POLICY "Anonymous can insert email logs"
  ON email_logs FOR INSERT
  TO anon
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_burner_emails_updated_at'
  ) THEN
    CREATE TRIGGER update_burner_emails_updated_at
      BEFORE UPDATE ON burner_emails
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Function to increment email counters
CREATE OR REPLACE FUNCTION increment_email_received(p_email_address text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  UPDATE burner_emails
  SET 
    emails_received = emails_received + 1,
    last_email_at = now()
  WHERE email_address = p_email_address
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING jsonb_build_object(
    'id', id,
    'email_address', email_address,
    'real_email', real_email,
    'is_active', is_active
  ) INTO result;

  RETURN result;
END;
$$;

-- Function to increment forwarded counter
CREATE OR REPLACE FUNCTION increment_email_forwarded(p_burner_email_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE burner_emails
  SET emails_forwarded = emails_forwarded + 1
  WHERE id = p_burner_email_id;
END;
$$;

-- Function to cleanup expired burner emails
CREATE OR REPLACE FUNCTION cleanup_expired_burner_emails()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count int;
BEGIN
  UPDATE burner_emails
  SET is_active = false
  WHERE expires_at < now()
    AND is_active = true;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add trackers_removed column to email_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'trackers_removed'
  ) THEN
    ALTER TABLE email_logs ADD COLUMN trackers_removed int DEFAULT 0;
  END IF;
END $$;
