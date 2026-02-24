-- Generations table
CREATE TABLE IF NOT EXISTS public.generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  competitor_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  result_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);
