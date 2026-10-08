CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 name text NOT NULL, role text NOT NULL CHECK (role IN ('designer','manager','admin')),
 direction text NOT NULL DEFAULT '', manager_id uuid REFERENCES users(id),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS matrices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
 data jsonb NOT NULL, published boolean NOT NULL DEFAULT false,
 source_note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cycles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
 matrix_id uuid NOT NULL REFERENCES matrices(id), review_date date NOT NULL,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id uuid NOT NULL REFERENCES cycles(id),
 user_id uuid NOT NULL REFERENCES users(id), status integer NOT NULL DEFAULT 0 CHECK(status BETWEEN 0 AND 6),
 primary_track text, additional_track text, review_date date,
 employee_confirmed boolean NOT NULL DEFAULT false, manager_confirmed boolean NOT NULL DEFAULT false,
 review_comment text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cycle_id,user_id), CHECK(primary_track IS DISTINCT FROM additional_track OR primary_track IS NULL)
);
CREATE TABLE IF NOT EXISTS ratings (
 assessment_id uuid NOT NULL REFERENCES assessments(id), competency_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('self','manager','final')),
 answer text NOT NULL CHECK(answer IN ('unanswered','na','rated')),
 value integer CHECK(value BETWEEN 1 AND 4), comment text NOT NULL DEFAULT '',
 evidence jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(assessment_id,competency_id,kind),
 CHECK((answer='rated' AND value IS NOT NULL) OR (answer <> 'rated' AND value IS NULL))
);
CREATE TABLE IF NOT EXISTS goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL REFERENCES assessments(id),
 source text NOT NULL CHECK(source IN ('general','track')), competency_id text NOT NULL,
 current_level integer NOT NULL CHECK(current_level BETWEEN 1 AND 4), target_level integer NOT NULL CHECK(target_level BETWEEN 1 AND 4),
 months integer NOT NULL CHECK(months IN (3,6)), due_date date NOT NULL,
 expected_result text NOT NULL, success_criteria text NOT NULL,
 actions jsonb NOT NULL CHECK(jsonb_array_length(actions) BETWEEN 2 AND 4),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','postponed','cancelled')),
 checkpoints jsonb NOT NULL DEFAULT '[]', material_ids uuid[] NOT NULL DEFAULT '{}',
 employee_comment text NOT NULL DEFAULT '', manager_comment text NOT NULL DEFAULT '',
 employee_approved boolean NOT NULL DEFAULT false, manager_approved boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assessment_id,source)
);
CREATE TABLE IF NOT EXISTS materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL,
 url text NOT NULL CHECK(url ~ '^https?://'), type text NOT NULL,
 category text NOT NULL DEFAULT '', difficulty text NOT NULL DEFAULT 'Любой уровень',
 tags text[] NOT NULL DEFAULT '{}', author text NOT NULL DEFAULT '', internal boolean NOT NULL DEFAULT false,
 competency_ids text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS favorites (
 user_id uuid NOT NULL REFERENCES users(id), material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,material_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES users(id), assessment_id uuid REFERENCES assessments(id),
 entity text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
 old_data jsonb, new_data jsonb, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessments_user_idx ON assessments(user_id);
CREATE INDEX IF NOT EXISTS users_manager_idx ON users(manager_id);
CREATE INDEX IF NOT EXISTS audit_assessment_idx ON audit_events(assessment_id);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS history_goals jsonb;

CREATE OR REPLACE FUNCTION actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('app.user_id',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION actor_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT role FROM public.users WHERE id=public.actor_id() AND active
$$;
CREATE OR REPLACE FUNCTION can_access_assessment(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.assessments a JOIN public.users u ON u.id=a.user_id
 WHERE a.id=aid AND (a.user_id=public.actor_id() OR (public.actor_role()='manager' AND u.manager_id=public.actor_id()) OR public.actor_role()='admin'))
$$;
CREATE OR REPLACE FUNCTION manages_assessment(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.assessments a JOIN public.users u ON u.id=a.user_id
 WHERE a.id=aid AND ((public.actor_role()='manager' AND u.manager_id=public.actor_id()) OR public.actor_role()='admin'))
$$;
CREATE OR REPLACE FUNCTION owns_assessment(aid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.assessments WHERE id=aid AND user_id=public.actor_id())
$$;
CREATE OR REPLACE FUNCTION assessment_status(aid uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT status FROM public.assessments WHERE id=aid
$$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read ON users;
CREATE POLICY users_read ON users FOR SELECT USING(id=actor_id() OR actor_role()='admin' OR (actor_role()='manager' AND manager_id=actor_id()));
DROP POLICY IF EXISTS users_admin ON users;
CREATE POLICY users_admin ON users FOR ALL USING(actor_role()='admin') WITH CHECK(actor_role()='admin');
DROP POLICY IF EXISTS matrices_read ON matrices;
CREATE POLICY matrices_read ON matrices FOR SELECT USING(published OR actor_role()='admin');
DROP POLICY IF EXISTS matrices_admin ON matrices;
CREATE POLICY matrices_admin ON matrices FOR ALL USING(actor_role()='admin') WITH CHECK(actor_role()='admin');
DROP POLICY IF EXISTS cycles_read ON cycles;
CREATE POLICY cycles_read ON cycles FOR SELECT USING(actor_role() IS NOT NULL);
DROP POLICY IF EXISTS cycles_admin ON cycles;
CREATE POLICY cycles_admin ON cycles FOR ALL USING(actor_role()='admin') WITH CHECK(actor_role()='admin');
DROP POLICY IF EXISTS assessments_read ON assessments;
CREATE POLICY assessments_read ON assessments FOR SELECT USING(can_access_assessment(id));
DROP POLICY IF EXISTS assessments_write ON assessments;
CREATE POLICY assessments_write ON assessments FOR UPDATE USING(can_access_assessment(id)) WITH CHECK(can_access_assessment(id));
DROP POLICY IF EXISTS assessments_create ON assessments;
CREATE POLICY assessments_create ON assessments FOR INSERT WITH CHECK(actor_role()='admin');
DROP POLICY IF EXISTS ratings_read ON ratings;
CREATE POLICY ratings_read ON ratings FOR SELECT USING(can_access_assessment(assessment_id) AND
 ((kind='self' AND (owns_assessment(assessment_id) OR actor_role()='admin' OR assessment_status(assessment_id)>=1))
 OR kind='final' OR (kind='manager' AND (manages_assessment(assessment_id) OR assessment_status(assessment_id)>=3))));
DROP POLICY IF EXISTS ratings_insert ON ratings;
CREATE POLICY ratings_insert ON ratings FOR INSERT WITH CHECK(
 (kind='self' AND owns_assessment(assessment_id) AND assessment_status(assessment_id)=0)
 OR (kind='manager' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (1,2))
 OR (kind='final' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (4,5)));
DROP POLICY IF EXISTS ratings_update ON ratings;
CREATE POLICY ratings_update ON ratings FOR UPDATE USING(
 (kind='self' AND owns_assessment(assessment_id) AND assessment_status(assessment_id)=0)
 OR (kind='manager' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (1,2))
 OR (kind='final' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (4,5))) WITH CHECK(
 (kind='self' AND owns_assessment(assessment_id) AND assessment_status(assessment_id)=0)
 OR (kind='manager' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (1,2))
 OR (kind='final' AND manages_assessment(assessment_id) AND assessment_status(assessment_id) IN (4,5)));
DROP POLICY IF EXISTS goals_access ON goals;
CREATE POLICY goals_access ON goals FOR ALL USING(can_access_assessment(assessment_id)) WITH CHECK(can_access_assessment(assessment_id) AND assessment_status(assessment_id)>=4);
DROP POLICY IF EXISTS materials_read ON materials;
CREATE POLICY materials_read ON materials FOR SELECT USING(NOT internal OR actor_role() IS NOT NULL);
DROP POLICY IF EXISTS materials_admin ON materials;
CREATE POLICY materials_admin ON materials FOR ALL USING(actor_role()='admin') WITH CHECK(actor_role()='admin');
DROP POLICY IF EXISTS favorites_access ON favorites;
CREATE POLICY favorites_access ON favorites FOR ALL USING(user_id=actor_id()) WITH CHECK(user_id=actor_id() AND EXISTS(SELECT 1 FROM materials WHERE id=material_id));
DROP POLICY IF EXISTS audit_read ON audit_events;
CREATE POLICY audit_read ON audit_events FOR SELECT USING(actor_role()='admin' OR (assessment_id IS NOT NULL AND manages_assessment(assessment_id)));

CREATE OR REPLACE FUNCTION log_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aid uuid; oldj jsonb; newj jsonb;
BEGIN
 IF TG_OP <> 'INSERT' THEN oldj=to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN newj=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='assessments' THEN aid=coalesce(NEW.id,OLD.id);
 ELSIF TG_TABLE_NAME IN ('ratings','goals') THEN aid=coalesce(NEW.assessment_id,OLD.assessment_id); END IF;
 IF TG_TABLE_NAME='users' THEN oldj=oldj-'password_hash'; newj=newj-'password_hash'; END IF;
 INSERT INTO public.audit_events(actor_id,assessment_id,entity,entity_id,action,old_data,new_data,reason)
 VALUES(public.actor_id(),aid,TG_TABLE_NAME,coalesce(newj->>'id',oldj->>'id',newj->>'competency_id',oldj->>'competency_id',''),TG_OP,oldj,newj,coalesce(current_setting('app.reason',true),''));
 RETURN coalesce(NEW,OLD);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','matrices','cycles','assessments','ratings','goals','materials'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS audit_change ON %I',t);
 EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_change()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION immutable_used_matrix() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM cycles WHERE matrix_id=OLD.id) AND (NEW.data IS DISTINCT FROM OLD.data OR NEW.published IS DISTINCT FROM OLD.published) THEN
 RAISE EXCEPTION 'Методика используемого цикла неизменяема; создайте новую версию'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS matrix_version_guard ON matrices;
CREATE TRIGGER matrix_version_guard BEFORE UPDATE ON matrices FOR EACH ROW EXECUTE FUNCTION immutable_used_matrix();

CREATE OR REPLACE FUNCTION auth_lookup(mail text) RETURNS TABLE(id uuid,password_hash text,active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id,password_hash,active FROM public.users WHERE email=lower(mail) $$;
CREATE OR REPLACE FUNCTION auth_session(token text) RETURNS TABLE(id uuid,email text,name text,role text,direction text,manager_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id,u.email,u.name,u.role,u.direction,u.manager_id FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=token AND s.expires_at>now() AND u.active
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO design_app;
GRANT SELECT,INSERT,UPDATE ON users,matrices,cycles,assessments,ratings,goals,materials TO design_app;
GRANT SELECT,INSERT,DELETE ON favorites TO design_app;
GRANT SELECT ON audit_events TO design_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,login_attempts TO design_app;
GRANT EXECUTE ON FUNCTION actor_id(),actor_role(),can_access_assessment(uuid),manages_assessment(uuid),owns_assessment(uuid),assessment_status(uuid),auth_lookup(text),auth_session(text) TO design_app;
