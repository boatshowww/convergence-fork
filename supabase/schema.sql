--
-- PostgreSQL database dump
--


-- Dumped from database version 15.8
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: calculate_timing_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_timing_metrics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Calculate query processing time (request start to streaming start)
    IF NEW.streaming_start_time IS NOT NULL AND NEW.request_start_time IS NOT NULL THEN
        NEW.query_processing_time_ms = EXTRACT(EPOCH FROM (NEW.streaming_start_time - NEW.request_start_time)) * 1000;
    END IF;
    
    -- Calculate response generation time (streaming start to completion)
    IF NEW.response_completed_time IS NOT NULL AND NEW.streaming_start_time IS NOT NULL THEN
        NEW.response_generation_time_ms = EXTRACT(EPOCH FROM (NEW.response_completed_time - NEW.streaming_start_time)) * 1000;
    END IF;
    
    -- Calculate characters per second metrics
    IF NEW.response_content IS NOT NULL THEN
        NEW.response_length = LENGTH(NEW.response_content);
        
        -- Total characters per second (total time)
        IF NEW.response_completed_time IS NOT NULL AND NEW.request_start_time IS NOT NULL THEN
            DECLARE
                total_seconds DECIMAL := EXTRACT(EPOCH FROM (NEW.response_completed_time - NEW.request_start_time));
            BEGIN
                IF total_seconds > 0 THEN
                    NEW.characters_per_second_total = NEW.response_length / total_seconds;
                END IF;
            END;
        END IF;
        
        -- Generation characters per second (streaming time only)
        IF NEW.response_generation_time_ms IS NOT NULL AND NEW.response_generation_time_ms > 0 THEN
            NEW.characters_per_second_generation = NEW.response_length / (NEW.response_generation_time_ms / 1000.0);
        END IF;
    END IF;
    
    -- Calculate cost from tokens + model pricing
    IF NEW.llm_model_id IS NOT NULL AND (NEW.input_tokens > 0 OR NEW.output_tokens > 0) THEN
        DECLARE
            model_rec RECORD;
        BEGIN
            SELECT * INTO model_rec FROM llm_model WHERE id = NEW.llm_model_id;
            
            IF FOUND THEN
                NEW.calculated_cost = 
                    COALESCE(
                        -- Input tokens (regular rate)
                        ((NEW.input_tokens - COALESCE(NEW.cached_input_tokens, 0)) * model_rec.cost_per_million_input_tokens / 1000000.0), 
                        0
                    ) +
                    COALESCE(
                        -- Cached input tokens (discounted rate)
                        (NEW.cached_input_tokens * model_rec.cost_per_million_cached_input_tokens / 1000000.0), 
                        0
                    ) +
                    COALESCE(
                        -- Output tokens
                        (NEW.output_tokens * model_rec.cost_per_million_output_tokens / 1000000.0), 
                        0
                    );
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: cleanup_old_llm_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_llm_logs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Delete entries older than retention period (default 90 days)
    DELETE FROM llm_entry 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Delete empty threads older than 7 days
    DELETE FROM llm_thread 
    WHERE id NOT IN (SELECT DISTINCT llm_thread_id FROM llm_entry)
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Log cleanup action
    RAISE NOTICE 'LLM log cleanup completed at %', NOW();
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: character; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."character" (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    game_id bigint,
    ship_id bigint,
    planet_id bigint,
    is_npc boolean DEFAULT true NOT NULL,
    is_alive boolean DEFAULT true NOT NULL,
    player_id bigint,
    is_primary boolean DEFAULT false NOT NULL,
    race_id bigint,
    subclass_id bigint,
    background text DEFAULT ''::character varying NOT NULL,
    intelligence smallint DEFAULT 0 NOT NULL,
    dexterity smallint DEFAULT 0 NOT NULL,
    strength smallint DEFAULT 0 NOT NULL,
    charisma smallint DEFAULT 0 NOT NULL,
    intuition smallint DEFAULT 0 NOT NULL,
    luck smallint DEFAULT 0 NOT NULL,
    constitution smallint DEFAULT 0 NOT NULL,
    current_hp smallint DEFAULT 100 NOT NULL,
    max_hp smallint DEFAULT 100 NOT NULL,
    core_skill_1_id bigint,
    core_skill_2_id bigint,
    core_skill_3_id bigint,
    core_skill_4_id bigint,
    core_skill_5_id bigint,
    vessel_piloting_success_checks integer DEFAULT 0 NOT NULL,
    drone_piloting_success_checks integer DEFAULT 0 NOT NULL,
    hardware_maintenance_success_checks integer DEFAULT 0 NOT NULL,
    computer_engineering_success_checks integer DEFAULT 0 NOT NULL,
    demolitions_success_checks integer DEFAULT 0 NOT NULL,
    persuasion_success_checks integer DEFAULT 0 NOT NULL,
    intimidation_success_checks integer DEFAULT 0 NOT NULL,
    deception_success_checks integer DEFAULT 0 NOT NULL,
    bartering_success_checks integer DEFAULT 0 NOT NULL,
    intuition_success_checks integer DEFAULT 0 NOT NULL,
    pistols_success_checks integer DEFAULT 0 NOT NULL,
    rifles_success_checks integer DEFAULT 0 NOT NULL,
    heavy_weapons_success_checks integer DEFAULT 0 NOT NULL,
    melee_weapons_success_checks integer DEFAULT 0 NOT NULL,
    brawling_success_checks integer DEFAULT 0 NOT NULL,
    foraging_success_checks integer DEFAULT 0 NOT NULL,
    perception_success_checks integer DEFAULT 0 NOT NULL,
    animal_handling_success_checks integer DEFAULT 0 NOT NULL,
    theft_success_checks integer DEFAULT 0 NOT NULL,
    hacking_success_checks integer DEFAULT 0 NOT NULL,
    performance_success_checks integer DEFAULT 0 NOT NULL,
    stealth_success_checks integer DEFAULT 0 NOT NULL,
    first_aid_success_checks integer DEFAULT 0 NOT NULL,
    evasion_success_checks integer DEFAULT 0 NOT NULL,
    education_success_checks integer DEFAULT 0 NOT NULL,
    user_id uuid,
    cosmic_tokens smallint DEFAULT 0 NOT NULL
);


--
-- Name: Character_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."character" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Character_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: game; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    user_id uuid NOT NULL,
    invite_code text
);


--
-- Name: Game_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.game ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Game_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: planet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planet (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    game_id bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: Planet_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.planet ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Planet_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: player; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    game_id bigint NOT NULL,
    role_id bigint NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: Player_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.player ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Player_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL
);


--
-- Name: Role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.role ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Role_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ship; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ship (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    game_id bigint NOT NULL,
    star_system_object_id bigint,
    current_shields smallint,
    max_shields smallint,
    current_hp smallint,
    max_hp smallint
);


--
-- Name: Ship_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ship ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Ship_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: star_system; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.star_system (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying NOT NULL,
    x numeric NOT NULL,
    y numeric NOT NULL,
    game_id bigint NOT NULL
);


--
-- Name: Star_System_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.star_system ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Star_System_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ability (
    id bigint NOT NULL,
    subclass_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    tier integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ability ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ability_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: character_ability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_ability (
    id bigint NOT NULL,
    character_id bigint NOT NULL,
    ability_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    game_id bigint
);


--
-- Name: character_ability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.character_ability ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.character_ability_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: class; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.class ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.class_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: class_skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_skill (
    id bigint NOT NULL,
    class_id bigint NOT NULL,
    skill_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_skill_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.class_skill ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.class_skill_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: error_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    source text NOT NULL,
    type text NOT NULL,
    error_data jsonb NOT NULL,
    user_id uuid,
    severity text DEFAULT 'ERROR'::text NOT NULL
);


--
-- Name: TABLE error_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.error_log IS 'Universal error logging for all application components (client, edge functions, database operations)';


--
-- Name: COLUMN error_log.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.id IS 'Primary key, auto-generated';


--
-- Name: COLUMN error_log.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.created_at IS 'Timestamp when error occurred';


--
-- Name: COLUMN error_log.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.source IS 'Error source: edge (functions), sql (database), client (browser)';


--
-- Name: COLUMN error_log.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.type IS 'Specific error location: game-page:on-party-click, character-creation:name-class-race-prompt, etc.';


--
-- Name: COLUMN error_log.error_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.error_data IS 'JSON containing error message, stack trace, request context, session info, and any relevant debugging data';


--
-- Name: COLUMN error_log.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.user_id IS 'ID of user who triggered the error (nullable for system errors)';


--
-- Name: COLUMN error_log.severity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_log.severity IS 'Error severity level: DEBUG, INFO, WARN, ERROR, CRITICAL';


--
-- Name: error_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.error_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.error_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: llm_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_entry (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    llm_thread_id bigint NOT NULL,
    llm_model_id bigint,
    role text NOT NULL,
    type text NOT NULL,
    request_start_time timestamp with time zone NOT NULL,
    streaming_start_time timestamp with time zone,
    response_completed_time timestamp with time zone,
    query_processing_time_ms integer,
    response_generation_time_ms integer,
    characters_per_second_total numeric(8,2),
    characters_per_second_generation numeric(8,2),
    messages jsonb NOT NULL,
    response_content text,
    response_length integer,
    input_tokens integer,
    output_tokens integer,
    cached_input_tokens integer DEFAULT 0,
    calculated_cost numeric(10,6),
    error_message text,
    http_status_code integer,
    request_id text,
    success boolean DEFAULT true
);


--
-- Name: llm_model; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_model (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    provider text NOT NULL,
    display_name text,
    cost_per_million_input_tokens numeric(10,2),
    cost_per_million_cached_input_tokens numeric(10,2),
    cost_per_million_output_tokens numeric(10,2),
    is_active boolean DEFAULT true,
    notes text
);


--
-- Name: llm_cost_by_model; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.llm_cost_by_model AS
 SELECT m.name AS model_name,
    m.provider,
    m.display_name,
    count(e.id) AS total_requests,
    sum(e.calculated_cost) AS total_cost,
    avg(e.calculated_cost) AS avg_cost_per_request,
    sum(e.input_tokens) AS total_input_tokens,
    sum(e.output_tokens) AS total_output_tokens,
    sum(e.cached_input_tokens) AS total_cached_tokens
   FROM (public.llm_model m
     LEFT JOIN public.llm_entry e ON ((m.id = e.llm_model_id)))
  WHERE (e.created_at >= (now() - '30 days'::interval))
  GROUP BY m.id, m.name, m.provider, m.display_name
  ORDER BY (sum(e.calculated_cost)) DESC;


--
-- Name: llm_entry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.llm_entry ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.llm_entry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: llm_model_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.llm_model ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.llm_model_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: llm_thread; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_thread (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text,
    user_id uuid,
    game_id bigint,
    is_active boolean DEFAULT true
);


--
-- Name: llm_thread_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.llm_thread ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.llm_thread_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: llm_thread_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.llm_thread_summary AS
 SELECT t.id,
    t.name,
    t.user_id,
    t.game_id,
    t.created_at,
    t.updated_at,
    t.is_active,
    count(e.id) AS entry_count,
    sum(e.calculated_cost) AS total_cost,
    avg(e.query_processing_time_ms) AS avg_query_time_ms,
    avg(e.response_generation_time_ms) AS avg_generation_time_ms,
    avg(e.characters_per_second_total) AS avg_chars_per_second,
    sum(e.input_tokens) AS total_input_tokens,
    sum(e.output_tokens) AS total_output_tokens,
    sum(e.cached_input_tokens) AS total_cached_tokens
   FROM (public.llm_thread t
     LEFT JOIN public.llm_entry e ON ((t.id = e.llm_thread_id)))
  GROUP BY t.id, t.name, t.user_id, t.game_id, t.created_at, t.updated_at, t.is_active;


--
-- Name: star_system_object; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.star_system_object (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    star_system_id bigint NOT NULL,
    x numeric NOT NULL,
    y numeric NOT NULL,
    velocity numeric NOT NULL,
    heading numeric NOT NULL,
    visual jsonb DEFAULT '"''{\"type\": \"circle\", \"diameter\": 100}}''"'::jsonb NOT NULL,
    star_system_object_type_id bigint NOT NULL,
    game_id bigint
);


--
-- Name: object_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.star_system_object ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.object_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: race; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    base_intelligence smallint NOT NULL,
    base_dexterity smallint NOT NULL,
    base_strength smallint NOT NULL,
    base_charisma smallint NOT NULL,
    base_intuition smallint NOT NULL,
    base_luck smallint NOT NULL,
    base_constitution smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: race_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.race ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.race_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    stat_id bigint NOT NULL,
    ordinal_position integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category character varying(50) NOT NULL,
    field_name character varying(64) NOT NULL
);


--
-- Name: skill_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.skill ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.skill_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: star_system_object_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.star_system_object_type (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying NOT NULL
);


--
-- Name: star_system_object_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.star_system_object_type ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.star_system_object_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stat (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    ordinal_position integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stat_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stat ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stat_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subclass; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subclass (
    id bigint NOT NULL,
    class_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subclass_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subclass ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subclass_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subclass_skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subclass_skill (
    id bigint NOT NULL,
    subclass_id bigint NOT NULL,
    skill_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subclass_skill_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subclass_skill ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subclass_skill_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: character Character_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT "Character_pkey" PRIMARY KEY (id);


--
-- Name: game Game_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game
    ADD CONSTRAINT "Game_pkey" PRIMARY KEY (id);


--
-- Name: planet Planet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planet
    ADD CONSTRAINT "Planet_pkey" PRIMARY KEY (id);


--
-- Name: player Player_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player
    ADD CONSTRAINT "Player_pkey" PRIMARY KEY (id);


--
-- Name: role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);


--
-- Name: ship Ship_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship
    ADD CONSTRAINT "Ship_pkey" PRIMARY KEY (id);


--
-- Name: star_system Star_System_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system
    ADD CONSTRAINT "Star_System_pkey" PRIMARY KEY (id);


--
-- Name: ability ability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability
    ADD CONSTRAINT ability_pkey PRIMARY KEY (id);


--
-- Name: character_ability character_ability_character_id_ability_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_ability
    ADD CONSTRAINT character_ability_character_id_ability_id_key UNIQUE (character_id, ability_id);


--
-- Name: character_ability character_ability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_ability
    ADD CONSTRAINT character_ability_pkey PRIMARY KEY (id);


--
-- Name: class class_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class
    ADD CONSTRAINT class_pkey PRIMARY KEY (id);


--
-- Name: class_skill class_skill_class_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_skill
    ADD CONSTRAINT class_skill_class_id_skill_id_key UNIQUE (class_id, skill_id);


--
-- Name: class_skill class_skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_skill
    ADD CONSTRAINT class_skill_pkey PRIMARY KEY (id);


--
-- Name: error_log error_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log
    ADD CONSTRAINT error_log_pkey PRIMARY KEY (id);


--
-- Name: llm_entry llm_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_entry
    ADD CONSTRAINT llm_entry_pkey PRIMARY KEY (id);


--
-- Name: llm_model llm_model_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_model
    ADD CONSTRAINT llm_model_name_key UNIQUE (name);


--
-- Name: llm_model llm_model_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_model
    ADD CONSTRAINT llm_model_pkey PRIMARY KEY (id);


--
-- Name: llm_thread llm_thread_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_thread
    ADD CONSTRAINT llm_thread_pkey PRIMARY KEY (id);


--
-- Name: star_system_object object_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system_object
    ADD CONSTRAINT object_pkey PRIMARY KEY (id);


--
-- Name: race race_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race
    ADD CONSTRAINT race_pkey PRIMARY KEY (id);


--
-- Name: skill skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_pkey PRIMARY KEY (id);


--
-- Name: star_system_object_type star_system_object_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system_object_type
    ADD CONSTRAINT star_system_object_type_pkey PRIMARY KEY (id);


--
-- Name: stat stat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stat
    ADD CONSTRAINT stat_pkey PRIMARY KEY (id);


--
-- Name: subclass subclass_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass
    ADD CONSTRAINT subclass_pkey PRIMARY KEY (id);


--
-- Name: subclass_skill subclass_skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass_skill
    ADD CONSTRAINT subclass_skill_pkey PRIMARY KEY (id);


--
-- Name: subclass_skill subclass_skill_subclass_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass_skill
    ADD CONSTRAINT subclass_skill_subclass_id_skill_id_key UNIQUE (subclass_id, skill_id);


--
-- Name: game_invite_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX game_invite_code_key ON public.game USING btree (invite_code);


--
-- Name: idx_error_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_created_at ON public.error_log USING btree (created_at);


--
-- Name: INDEX idx_error_log_created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_error_log_created_at IS 'Index for time-based queries and cleanup operations';


--
-- Name: idx_error_log_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_severity ON public.error_log USING btree (severity);


--
-- Name: INDEX idx_error_log_severity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_error_log_severity IS 'Index for filtering by error severity';


--
-- Name: idx_error_log_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_source ON public.error_log USING btree (source);


--
-- Name: INDEX idx_error_log_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_error_log_source IS 'Index for filtering errors by source type';


--
-- Name: idx_error_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_user_id ON public.error_log USING btree (user_id);


--
-- Name: INDEX idx_error_log_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_error_log_user_id IS 'Index for user-specific error analysis';


--
-- Name: idx_llm_entry_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_created_at ON public.llm_entry USING btree (created_at);


--
-- Name: idx_llm_entry_model_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_model_id ON public.llm_entry USING btree (llm_model_id);


--
-- Name: idx_llm_entry_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_request_id ON public.llm_entry USING btree (request_id);


--
-- Name: idx_llm_entry_request_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_request_start_time ON public.llm_entry USING btree (request_start_time);


--
-- Name: idx_llm_entry_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_role ON public.llm_entry USING btree (role);


--
-- Name: idx_llm_entry_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_success ON public.llm_entry USING btree (success);


--
-- Name: idx_llm_entry_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_thread_id ON public.llm_entry USING btree (llm_thread_id);


--
-- Name: idx_llm_entry_thread_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_thread_time ON public.llm_entry USING btree (llm_thread_id, request_start_time);


--
-- Name: idx_llm_entry_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_entry_type ON public.llm_entry USING btree (type);


--
-- Name: idx_llm_model_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_model_active ON public.llm_model USING btree (is_active);


--
-- Name: idx_llm_model_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_model_name ON public.llm_model USING btree (name);


--
-- Name: idx_llm_model_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_model_provider ON public.llm_model USING btree (provider);


--
-- Name: idx_llm_thread_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_thread_created_at ON public.llm_thread USING btree (created_at);


--
-- Name: idx_llm_thread_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_thread_game_id ON public.llm_thread USING btree (game_id);


--
-- Name: idx_llm_thread_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_thread_is_active ON public.llm_thread USING btree (is_active);


--
-- Name: idx_llm_thread_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_thread_user_id ON public.llm_thread USING btree (user_id);


--
-- Name: idx_skill_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_category ON public.skill USING btree (category);


--
-- Name: idx_unique_player_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_player_primary ON public."character" USING btree (player_id) WHERE ((player_id IS NOT NULL) AND (is_primary = true));


--
-- Name: llm_entry calculate_metrics_on_entry_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calculate_metrics_on_entry_update BEFORE UPDATE ON public.llm_entry FOR EACH ROW EXECUTE FUNCTION public.calculate_timing_metrics();


--
-- Name: character Character_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT "Character_game_id_fkey" FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: character Character_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT "Character_ship_id_fkey" FOREIGN KEY (ship_id) REFERENCES public.ship(id);


--
-- Name: game Game_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game
    ADD CONSTRAINT "Game_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: planet Planet_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planet
    ADD CONSTRAINT "Planet_game_id_fkey" FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: player Player_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player
    ADD CONSTRAINT "Player_game_id_fkey" FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: player Player_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player
    ADD CONSTRAINT "Player_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.role(id);


--
-- Name: player Player_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player
    ADD CONSTRAINT "Player_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: ship Ship_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship
    ADD CONSTRAINT "Ship_game_id_fkey" FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: star_system Star_System_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system
    ADD CONSTRAINT "Star_System_game_id_fkey" FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: ability ability_subclass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability
    ADD CONSTRAINT ability_subclass_id_fkey FOREIGN KEY (subclass_id) REFERENCES public.subclass(id);


--
-- Name: character_ability character_ability_ability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_ability
    ADD CONSTRAINT character_ability_ability_id_fkey FOREIGN KEY (ability_id) REFERENCES public.ability(id);


--
-- Name: character_ability character_ability_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_ability
    ADD CONSTRAINT character_ability_character_id_fkey FOREIGN KEY (character_id) REFERENCES public."character"(id);


--
-- Name: character character_core_skill_1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_core_skill_1_id_fkey FOREIGN KEY (core_skill_1_id) REFERENCES public.skill(id);


--
-- Name: character character_core_skill_2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_core_skill_2_id_fkey FOREIGN KEY (core_skill_2_id) REFERENCES public.skill(id);


--
-- Name: character character_core_skill_3_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_core_skill_3_id_fkey FOREIGN KEY (core_skill_3_id) REFERENCES public.skill(id);


--
-- Name: character character_core_skill_4_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_core_skill_4_id_fkey FOREIGN KEY (core_skill_4_id) REFERENCES public.skill(id);


--
-- Name: character character_core_skill_5_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_core_skill_5_id_fkey FOREIGN KEY (core_skill_5_id) REFERENCES public.skill(id);


--
-- Name: character character_planet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_planet_id_fkey FOREIGN KEY (planet_id) REFERENCES public.planet(id);


--
-- Name: character character_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.player(id);


--
-- Name: character character_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.race(id);


--
-- Name: character character_subclass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_subclass_id_fkey FOREIGN KEY (subclass_id) REFERENCES public.subclass(id);


--
-- Name: character character_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."character"
    ADD CONSTRAINT character_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: class_skill class_skill_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_skill
    ADD CONSTRAINT class_skill_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.class(id);


--
-- Name: class_skill class_skill_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_skill
    ADD CONSTRAINT class_skill_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skill(id);


--
-- Name: character_ability fk_character_ability_game; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_ability
    ADD CONSTRAINT fk_character_ability_game FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: star_system_object fk_star_system_object_game; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system_object
    ADD CONSTRAINT fk_star_system_object_game FOREIGN KEY (game_id) REFERENCES public.game(id);


--
-- Name: llm_entry llm_entry_llm_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_entry
    ADD CONSTRAINT llm_entry_llm_model_id_fkey FOREIGN KEY (llm_model_id) REFERENCES public.llm_model(id);


--
-- Name: llm_entry llm_entry_llm_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_entry
    ADD CONSTRAINT llm_entry_llm_thread_id_fkey FOREIGN KEY (llm_thread_id) REFERENCES public.llm_thread(id) ON DELETE CASCADE;


--
-- Name: star_system_object object_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system_object
    ADD CONSTRAINT object_system_id_fkey FOREIGN KEY (star_system_id) REFERENCES public.star_system(id);


--
-- Name: ship ship_star_system_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship
    ADD CONSTRAINT ship_star_system_object_id_fkey FOREIGN KEY (star_system_object_id) REFERENCES public.star_system_object(id);


--
-- Name: skill skill_stat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_stat_id_fkey FOREIGN KEY (stat_id) REFERENCES public.stat(id);


--
-- Name: star_system_object star_system_object_star_system_object_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_system_object
    ADD CONSTRAINT star_system_object_star_system_object_type_id_fkey FOREIGN KEY (star_system_object_type_id) REFERENCES public.star_system_object_type(id);


--
-- Name: subclass subclass_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass
    ADD CONSTRAINT subclass_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.class(id);


--
-- Name: subclass_skill subclass_skill_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass_skill
    ADD CONSTRAINT subclass_skill_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skill(id);


--
-- Name: subclass_skill subclass_skill_subclass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subclass_skill
    ADD CONSTRAINT subclass_skill_subclass_id_fkey FOREIGN KEY (subclass_id) REFERENCES public.subclass(id);


--
-- Name: error_log Service role full access to error_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to error_log" ON public.error_log USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: POLICY "Service role full access to error_log" ON error_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Service role full access to error_log" ON public.error_log IS 'Only service role can access error logs - prevents users from reading/manipulating error data';


--
-- Name: llm_entry Service role full access to llm_entry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to llm_entry" ON public.llm_entry USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: llm_model Service role full access to llm_model; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to llm_model" ON public.llm_model USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: llm_thread Service role full access to llm_thread; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to llm_thread" ON public.llm_thread USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: character TEMP; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TEMP" ON public."character" USING (true);


--
-- Name: character_ability TEMP; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TEMP" ON public.character_ability USING (true);


--
-- Name: game TEMP - TRUE; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TEMP - TRUE" ON public.game USING (true);


--
-- Name: character Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public."character" FOR SELECT USING (true);


--
-- Name: planet Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.planet USING (true);


--
-- Name: player Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.player USING (true);


--
-- Name: role Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.role FOR SELECT USING (true);


--
-- Name: star_system Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.star_system USING (true);


--
-- Name: star_system_object Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.star_system_object USING (true);


--
-- Name: star_system_object_type Temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp" ON public.star_system_object_type USING (true);


--
-- Name: ship Temp - Delete Me; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temp - Delete Me" ON public.ship USING (true);


--
-- Name: ability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ability ENABLE ROW LEVEL SECURITY;

--
-- Name: character; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."character" ENABLE ROW LEVEL SECURITY;

--
-- Name: character_ability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_ability ENABLE ROW LEVEL SECURITY;

--
-- Name: class; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class ENABLE ROW LEVEL SECURITY;

--
-- Name: class_skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: error_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

--
-- Name: game; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_entry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_model; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_model ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_thread; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_thread ENABLE ROW LEVEL SECURITY;

--
-- Name: planet; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planet ENABLE ROW LEVEL SECURITY;

--
-- Name: player; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player ENABLE ROW LEVEL SECURITY;

--
-- Name: race; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.race ENABLE ROW LEVEL SECURITY;

--
-- Name: role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

--
-- Name: ship; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ship ENABLE ROW LEVEL SECURITY;

--
-- Name: skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill ENABLE ROW LEVEL SECURITY;

--
-- Name: star_system; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.star_system ENABLE ROW LEVEL SECURITY;

--
-- Name: star_system_object; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.star_system_object ENABLE ROW LEVEL SECURITY;

--
-- Name: star_system_object_type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.star_system_object_type ENABLE ROW LEVEL SECURITY;

--
-- Name: stat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stat ENABLE ROW LEVEL SECURITY;

--
-- Name: subclass; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subclass ENABLE ROW LEVEL SECURITY;

--
-- Name: subclass_skill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subclass_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: ability temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.ability USING (true);


--
-- Name: character_ability temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.character_ability USING (true);


--
-- Name: class temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.class USING (true);


--
-- Name: class_skill temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.class_skill USING (true);


--
-- Name: race temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.race USING (true);


--
-- Name: skill temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.skill USING (true);


--
-- Name: stat temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.stat USING (true);


--
-- Name: subclass temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.subclass USING (true);


--
-- Name: subclass_skill temp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp ON public.subclass_skill USING (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION calculate_timing_metrics(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_timing_metrics() TO anon;
GRANT ALL ON FUNCTION public.calculate_timing_metrics() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_timing_metrics() TO service_role;


--
-- Name: FUNCTION cleanup_old_llm_logs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_old_llm_logs() TO anon;
GRANT ALL ON FUNCTION public.cleanup_old_llm_logs() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_llm_logs() TO service_role;


--
-- Name: TABLE "character"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."character" TO anon;
GRANT ALL ON TABLE public."character" TO authenticated;
GRANT ALL ON TABLE public."character" TO service_role;


--
-- Name: SEQUENCE "Character_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Character_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Character_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Character_id_seq" TO service_role;


--
-- Name: TABLE game; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game TO anon;
GRANT ALL ON TABLE public.game TO authenticated;
GRANT ALL ON TABLE public.game TO service_role;


--
-- Name: SEQUENCE "Game_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Game_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Game_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Game_id_seq" TO service_role;


--
-- Name: TABLE planet; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.planet TO anon;
GRANT ALL ON TABLE public.planet TO authenticated;
GRANT ALL ON TABLE public.planet TO service_role;


--
-- Name: SEQUENCE "Planet_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Planet_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Planet_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Planet_id_seq" TO service_role;


--
-- Name: TABLE player; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.player TO anon;
GRANT ALL ON TABLE public.player TO authenticated;
GRANT ALL ON TABLE public.player TO service_role;


--
-- Name: SEQUENCE "Player_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Player_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Player_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Player_id_seq" TO service_role;


--
-- Name: TABLE role; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role TO anon;
GRANT ALL ON TABLE public.role TO authenticated;
GRANT ALL ON TABLE public.role TO service_role;


--
-- Name: SEQUENCE "Role_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Role_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Role_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Role_id_seq" TO service_role;


--
-- Name: TABLE ship; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ship TO anon;
GRANT ALL ON TABLE public.ship TO authenticated;
GRANT ALL ON TABLE public.ship TO service_role;


--
-- Name: SEQUENCE "Ship_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Ship_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Ship_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Ship_id_seq" TO service_role;


--
-- Name: TABLE star_system; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.star_system TO anon;
GRANT ALL ON TABLE public.star_system TO authenticated;
GRANT ALL ON TABLE public.star_system TO service_role;


--
-- Name: SEQUENCE "Star_System_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public."Star_System_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Star_System_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Star_System_id_seq" TO service_role;


--
-- Name: TABLE ability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ability TO anon;
GRANT ALL ON TABLE public.ability TO authenticated;
GRANT ALL ON TABLE public.ability TO service_role;


--
-- Name: SEQUENCE ability_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.ability_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ability_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ability_id_seq TO service_role;


--
-- Name: TABLE character_ability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_ability TO anon;
GRANT ALL ON TABLE public.character_ability TO authenticated;
GRANT ALL ON TABLE public.character_ability TO service_role;


--
-- Name: SEQUENCE character_ability_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.character_ability_id_seq TO anon;
GRANT ALL ON SEQUENCE public.character_ability_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.character_ability_id_seq TO service_role;


--
-- Name: TABLE class; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class TO anon;
GRANT ALL ON TABLE public.class TO authenticated;
GRANT ALL ON TABLE public.class TO service_role;


--
-- Name: SEQUENCE class_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.class_id_seq TO anon;
GRANT ALL ON SEQUENCE public.class_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.class_id_seq TO service_role;


--
-- Name: TABLE class_skill; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_skill TO anon;
GRANT ALL ON TABLE public.class_skill TO authenticated;
GRANT ALL ON TABLE public.class_skill TO service_role;


--
-- Name: SEQUENCE class_skill_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.class_skill_id_seq TO anon;
GRANT ALL ON SEQUENCE public.class_skill_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.class_skill_id_seq TO service_role;


--
-- Name: TABLE error_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.error_log TO anon;
GRANT ALL ON TABLE public.error_log TO authenticated;
GRANT ALL ON TABLE public.error_log TO service_role;


--
-- Name: SEQUENCE error_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.error_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.error_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.error_log_id_seq TO service_role;


--
-- Name: TABLE llm_entry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.llm_entry TO anon;
GRANT ALL ON TABLE public.llm_entry TO authenticated;
GRANT ALL ON TABLE public.llm_entry TO service_role;


--
-- Name: TABLE llm_model; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.llm_model TO anon;
GRANT ALL ON TABLE public.llm_model TO authenticated;
GRANT ALL ON TABLE public.llm_model TO service_role;


--
-- Name: TABLE llm_cost_by_model; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.llm_cost_by_model TO anon;
GRANT ALL ON TABLE public.llm_cost_by_model TO authenticated;
GRANT ALL ON TABLE public.llm_cost_by_model TO service_role;


--
-- Name: SEQUENCE llm_entry_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.llm_entry_id_seq TO anon;
GRANT ALL ON SEQUENCE public.llm_entry_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.llm_entry_id_seq TO service_role;


--
-- Name: SEQUENCE llm_model_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.llm_model_id_seq TO anon;
GRANT ALL ON SEQUENCE public.llm_model_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.llm_model_id_seq TO service_role;


--
-- Name: TABLE llm_thread; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.llm_thread TO anon;
GRANT ALL ON TABLE public.llm_thread TO authenticated;
GRANT ALL ON TABLE public.llm_thread TO service_role;


--
-- Name: SEQUENCE llm_thread_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.llm_thread_id_seq TO anon;
GRANT ALL ON SEQUENCE public.llm_thread_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.llm_thread_id_seq TO service_role;


--
-- Name: TABLE llm_thread_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.llm_thread_summary TO anon;
GRANT ALL ON TABLE public.llm_thread_summary TO authenticated;
GRANT ALL ON TABLE public.llm_thread_summary TO service_role;


--
-- Name: TABLE star_system_object; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.star_system_object TO anon;
GRANT ALL ON TABLE public.star_system_object TO authenticated;
GRANT ALL ON TABLE public.star_system_object TO service_role;


--
-- Name: SEQUENCE object_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.object_id_seq TO anon;
GRANT ALL ON SEQUENCE public.object_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.object_id_seq TO service_role;


--
-- Name: TABLE race; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.race TO anon;
GRANT ALL ON TABLE public.race TO authenticated;
GRANT ALL ON TABLE public.race TO service_role;


--
-- Name: SEQUENCE race_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.race_id_seq TO anon;
GRANT ALL ON SEQUENCE public.race_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.race_id_seq TO service_role;


--
-- Name: TABLE skill; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill TO anon;
GRANT ALL ON TABLE public.skill TO authenticated;
GRANT ALL ON TABLE public.skill TO service_role;


--
-- Name: SEQUENCE skill_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.skill_id_seq TO anon;
GRANT ALL ON SEQUENCE public.skill_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.skill_id_seq TO service_role;


--
-- Name: TABLE star_system_object_type; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.star_system_object_type TO anon;
GRANT ALL ON TABLE public.star_system_object_type TO authenticated;
GRANT ALL ON TABLE public.star_system_object_type TO service_role;


--
-- Name: SEQUENCE star_system_object_type_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.star_system_object_type_id_seq TO anon;
GRANT ALL ON SEQUENCE public.star_system_object_type_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.star_system_object_type_id_seq TO service_role;


--
-- Name: TABLE stat; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stat TO anon;
GRANT ALL ON TABLE public.stat TO authenticated;
GRANT ALL ON TABLE public.stat TO service_role;


--
-- Name: SEQUENCE stat_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.stat_id_seq TO anon;
GRANT ALL ON SEQUENCE public.stat_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.stat_id_seq TO service_role;


--
-- Name: TABLE subclass; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subclass TO anon;
GRANT ALL ON TABLE public.subclass TO authenticated;
GRANT ALL ON TABLE public.subclass TO service_role;


--
-- Name: SEQUENCE subclass_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subclass_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subclass_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subclass_id_seq TO service_role;


--
-- Name: TABLE subclass_skill; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subclass_skill TO anon;
GRANT ALL ON TABLE public.subclass_skill TO authenticated;
GRANT ALL ON TABLE public.subclass_skill TO service_role;


--
-- Name: SEQUENCE subclass_skill_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subclass_skill_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subclass_skill_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subclass_skill_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


