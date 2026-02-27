--
-- PostgreSQL database dump
--

\restrict MibPcREeH6YNykbFBAEWcxWe7PVc4dNBLhi6hE16uk3T4DnloBDQxKATRP48xcq

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: get_quality_multiplier(integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_quality_multiplier(p_purity integer, p_stability integer, p_potency integer, p_density integer) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    avg_stat NUMERIC;
BEGIN
    avg_stat := (p_purity + p_stability + p_potency + p_density) / 4.0;
    RETURN 0.5 + (avg_stat / 100.0);
END;
$$;


ALTER FUNCTION public.get_quality_multiplier(p_purity integer, p_stability integer, p_potency integer, p_density integer) OWNER TO postgres;

--
-- Name: get_quality_tier(integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_quality_tier(p_purity integer, p_stability integer, p_potency integer, p_density integer) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    avg_stat NUMERIC;
BEGIN
    avg_stat := (p_purity + p_stability + p_potency + p_density) / 4.0;
    
    IF avg_stat <= 20 THEN
        RETURN 'Impure';
    ELSIF avg_stat <= 40 THEN
        RETURN 'Standard';
    ELSIF avg_stat <= 60 THEN
        RETURN 'Refined';
    ELSIF avg_stat <= 80 THEN
        RETURN 'Superior';
    ELSE
        RETURN 'Pristine';
    END IF;
END;
$$;


ALTER FUNCTION public.get_quality_tier(p_purity integer, p_stability integer, p_potency integer, p_density integer) OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: celestial_bodies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.celestial_bodies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    system_id uuid NOT NULL,
    name character varying(64) NOT NULL,
    body_type character varying(32) NOT NULL,
    orbit_radius double precision NOT NULL,
    orbit_speed double precision DEFAULT 1.0,
    orbit_offset double precision DEFAULT 0,
    size double precision DEFAULT 1.0,
    planet_type character varying(32),
    resources jsonb DEFAULT '{}'::jsonb,
    faction_id uuid,
    services jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    deposit_slots integer DEFAULT 4
);


ALTER TABLE public.celestial_bodies OWNER TO postgres;

--
-- Name: celestial_body_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.celestial_body_aliases (
    alias character varying(50) NOT NULL,
    celestial_body_id uuid
);


ALTER TABLE public.celestial_body_aliases OWNER TO postgres;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    channel_type character varying(32) NOT NULL,
    channel_id uuid,
    sender_id uuid NOT NULL,
    sender_name character varying(64) NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.chat_messages OWNER TO postgres;

--
-- Name: crew_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.crew_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    ship_id uuid,
    name character varying(64) NOT NULL,
    role character varying(32) NOT NULL,
    level integer DEFAULT 1,
    experience integer DEFAULT 0,
    health integer DEFAULT 100,
    morale integer DEFAULT 100,
    skill_piloting integer DEFAULT 10,
    skill_engineering integer DEFAULT 10,
    skill_combat integer DEFAULT 10,
    skill_science integer DEFAULT 10,
    assigned_room_id character varying(64),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.crew_members OWNER TO postgres;

--
-- Name: deployed_harvesters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deployed_harvesters (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    deposit_id uuid NOT NULL,
    harvester_type character varying(32) DEFAULT 'basic'::character varying NOT NULL,
    fuel_remaining integer DEFAULT 0 NOT NULL,
    storage_current integer DEFAULT 0,
    storage_capacity integer DEFAULT 200 NOT NULL,
    harvest_rate integer DEFAULT 30 NOT NULL,
    deployed_at timestamp with time zone DEFAULT now(),
    last_calculated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.deployed_harvesters OWNER TO postgres;

--
-- Name: friendships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.friendships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.friendships OWNER TO postgres;

--
-- Name: harvest_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.harvest_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    ship_id uuid NOT NULL,
    deposit_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    last_calculated_at timestamp with time zone DEFAULT now(),
    units_harvested integer DEFAULT 0,
    harvest_rate integer DEFAULT 50,
    is_active boolean DEFAULT true
);


ALTER TABLE public.harvest_sessions OWNER TO postgres;

--
-- Name: hub_instances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hub_instances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    system_id uuid NOT NULL,
    current_players integer DEFAULT 0,
    max_players integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.hub_instances OWNER TO postgres;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: mission_instances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mission_instances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    mission_type character varying(64) NOT NULL,
    difficulty integer DEFAULT 1,
    leader_id uuid NOT NULL,
    player_ids jsonb DEFAULT '[]'::jsonb,
    max_players integer DEFAULT 4,
    status character varying(32) DEFAULT 'forming'::character varying,
    state_data jsonb DEFAULT '{}'::jsonb,
    rewards jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.mission_instances OWNER TO postgres;

--
-- Name: planet_resource_affinities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.planet_resource_affinities (
    id integer NOT NULL,
    planet_type character varying(30) NOT NULL,
    resource_type_id integer NOT NULL,
    spawn_weight integer DEFAULT 100 NOT NULL,
    is_primary boolean DEFAULT false
);


ALTER TABLE public.planet_resource_affinities OWNER TO postgres;

--
-- Name: planet_resource_affinities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.planet_resource_affinities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planet_resource_affinities_id_seq OWNER TO postgres;

--
-- Name: planet_resource_affinities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.planet_resource_affinities_id_seq OWNED BY public.planet_resource_affinities.id;


--
-- Name: player_presence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.player_presence (
    user_id uuid NOT NULL,
    socket_id character varying(64),
    location_type character varying(32),
    location_id uuid,
    active_ship_id uuid,
    connected_at timestamp with time zone DEFAULT now(),
    last_heartbeat timestamp with time zone DEFAULT now()
);


ALTER TABLE public.player_presence OWNER TO postgres;

--
-- Name: player_research; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.player_research (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tech_id character varying(64) NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.player_research OWNER TO postgres;

--
-- Name: player_resource_inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.player_resource_inventory (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    resource_type_id integer NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    stat_purity integer NOT NULL,
    stat_stability integer NOT NULL,
    stat_potency integer NOT NULL,
    stat_density integer NOT NULL,
    acquired_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT player_resource_inventory_stat_density_check CHECK (((stat_density >= 0) AND (stat_density <= 100))),
    CONSTRAINT player_resource_inventory_stat_potency_check CHECK (((stat_potency >= 0) AND (stat_potency <= 100))),
    CONSTRAINT player_resource_inventory_stat_purity_check CHECK (((stat_purity >= 0) AND (stat_purity <= 100))),
    CONSTRAINT player_resource_inventory_stat_stability_check CHECK (((stat_stability >= 0) AND (stat_stability <= 100)))
);


ALTER TABLE public.player_resource_inventory OWNER TO postgres;

--
-- Name: player_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.player_resources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    credits bigint DEFAULT 1000,
    metals bigint DEFAULT 500,
    crystals bigint DEFAULT 100,
    gases bigint DEFAULT 200,
    rare_earth bigint DEFAULT 0,
    fuel bigint DEFAULT 300,
    food bigint DEFAULT 100,
    electronics bigint DEFAULT 50,
    components bigint DEFAULT 20,
    updated_at timestamp with time zone DEFAULT now(),
    scanner_probes integer DEFAULT 5,
    advanced_scanner_probes integer DEFAULT 2
);


ALTER TABLE public.player_resources OWNER TO postgres;

--
-- Name: COLUMN player_resources.scanner_probes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.player_resources.scanner_probes IS 'Basic orbital scanner probes';


--
-- Name: COLUMN player_resources.advanced_scanner_probes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.player_resources.advanced_scanner_probes IS 'Advanced ground scanner probes';


--
-- Name: player_surveys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.player_surveys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    celestial_body_id uuid NOT NULL,
    orbital_scanned boolean DEFAULT false,
    ground_scanned boolean DEFAULT false,
    scanned_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.player_surveys OWNER TO postgres;

--
-- Name: research_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.research_queue (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tech_id character varying(64) NOT NULL,
    progress integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.research_queue OWNER TO postgres;

--
-- Name: resource_deposits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_deposits (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    celestial_body_id uuid NOT NULL,
    resource_type_id integer NOT NULL,
    slot_number integer NOT NULL,
    quantity_remaining integer NOT NULL,
    quantity_total integer NOT NULL,
    stat_purity integer NOT NULL,
    stat_stability integer NOT NULL,
    stat_potency integer NOT NULL,
    stat_density integer NOT NULL,
    spawned_at timestamp with time zone DEFAULT now(),
    depleted_at timestamp with time zone,
    CONSTRAINT resource_deposits_stat_density_check CHECK (((stat_density >= 0) AND (stat_density <= 100))),
    CONSTRAINT resource_deposits_stat_potency_check CHECK (((stat_potency >= 0) AND (stat_potency <= 100))),
    CONSTRAINT resource_deposits_stat_purity_check CHECK (((stat_purity >= 0) AND (stat_purity <= 100))),
    CONSTRAINT resource_deposits_stat_stability_check CHECK (((stat_stability >= 0) AND (stat_stability <= 100)))
);


ALTER TABLE public.resource_deposits OWNER TO postgres;

--
-- Name: resource_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_types (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    category character varying(20) NOT NULL,
    rarity character varying(20) NOT NULL,
    base_price integer NOT NULL,
    description text,
    icon character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.resource_types OWNER TO postgres;

--
-- Name: resource_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.resource_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.resource_types_id_seq OWNER TO postgres;

--
-- Name: resource_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.resource_types_id_seq OWNED BY public.resource_types.id;


--
-- Name: ship_designs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ship_designs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(64) NOT NULL,
    hull_cells jsonb NOT NULL,
    rooms jsonb NOT NULL,
    hull_size integer NOT NULL,
    total_power integer NOT NULL,
    total_crew integer NOT NULL,
    total_cargo integer NOT NULL,
    is_valid boolean DEFAULT false,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ship_designs OWNER TO postgres;

--
-- Name: ships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    design_id uuid NOT NULL,
    name character varying(64) NOT NULL,
    status character varying(32) DEFAULT 'docked'::character varying,
    health integer DEFAULT 100,
    shield integer DEFAULT 100,
    fuel integer DEFAULT 100,
    location_type character varying(32) NOT NULL,
    location_id uuid,
    position_x double precision DEFAULT 0,
    position_y double precision DEFAULT 0,
    rotation double precision DEFAULT 0,
    velocity_x double precision DEFAULT 0,
    velocity_y double precision DEFAULT 0,
    cargo jsonb DEFAULT '{}'::jsonb,
    damage_state jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ships OWNER TO postgres;

--
-- Name: star_systems; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.star_systems (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(64) NOT NULL,
    galaxy_x double precision NOT NULL,
    galaxy_y double precision NOT NULL,
    star_type character varying(32) NOT NULL,
    star_size double precision DEFAULT 1.0,
    is_hub boolean DEFAULT false,
    danger_level integer DEFAULT 1,
    connections jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.star_systems OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(32) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    display_name character varying(64),
    avatar_url text,
    credits bigint DEFAULT 1000,
    total_playtime_seconds integer DEFAULT 0,
    is_online boolean DEFAULT false,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    auth_provider character varying(32) DEFAULT 'local'::character varying,
    oauth_id character varying(255)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: planet_resource_affinities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planet_resource_affinities ALTER COLUMN id SET DEFAULT nextval('public.planet_resource_affinities_id_seq'::regclass);


--
-- Name: resource_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_types ALTER COLUMN id SET DEFAULT nextval('public.resource_types_id_seq'::regclass);


--
-- Data for Name: celestial_bodies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, resources, faction_id, services, created_at, deposit_slots) FROM stdin;
977cbcac-5955-4dbd-82b6-b36f2708154f	db326e93-ec98-4fe1-ae65-34ba1065b107	Mercury	planet	50	1	0	1	barren	{"metals": 80, "rareEarth": 20}	\N	[]	2026-02-04 23:04:57.427547-05	4
c0529877-d6ff-4da9-b7d1-417d8ac877d9	db326e93-ec98-4fe1-ae65-34ba1065b107	Venus	planet	80	1	0	1	lava	{"gases": 40, "metals": 60}	\N	[]	2026-02-04 23:04:57.435729-05	4
77133111-02c3-4d40-b45f-13e0aeb8e091	db326e93-ec98-4fe1-ae65-34ba1065b107	Earth	planet	120	1	0	1	terran	{"food": 100, "metals": 30}	\N	[]	2026-02-04 23:04:57.43664-05	4
9e207028-e4e2-4836-852a-ede2db49f30a	db326e93-ec98-4fe1-ae65-34ba1065b107	Luna Station	station	130	1	0	1	\N	{}	\N	["trade", "repair", "refuel"]	2026-02-04 23:04:57.43754-05	4
3d49c5d5-6600-40fd-97c2-96ad1092c2e5	db326e93-ec98-4fe1-ae65-34ba1065b107	Mars	planet	170	1	0	1	desert	{"metals": 70, "crystals": 30}	\N	[]	2026-02-04 23:04:57.438398-05	4
8cb85090-a366-429c-832d-fb812670b47f	db326e93-ec98-4fe1-ae65-34ba1065b107	Asteroid Belt	asteroid_belt	250	1	0	1	\N	{"metals": 90, "crystals": 50, "rareEarth": 10}	\N	[]	2026-02-04 23:04:57.439234-05	4
d1c8c722-1b7f-490e-b820-d1e01dac8d3a	db326e93-ec98-4fe1-ae65-34ba1065b107	Jupiter	gas_giant	400	1	0	1	\N	{"fuel": 80, "gases": 100}	\N	[]	2026-02-04 23:04:57.439963-05	4
cdb2f7fe-47b2-49a5-9f27-029d83eb244d	db326e93-ec98-4fe1-ae65-34ba1065b107	Saturn	gas_giant	550	1	0	1	\N	{"fuel": 70, "gases": 90}	\N	[]	2026-02-04 23:04:57.440676-05	4
9510d5b8-5d67-48f0-9440-1ec8c1cc01fb	7baf67e1-67ae-44b0-8f44-a9e670d9260d	Proxima b	planet	80	1	0	1	rocky	{"metals": 60, "crystals": 40}	\N	[]	2026-02-04 23:04:57.444583-05	4
f2de881c-ae4c-4de7-a156-4da6b20fc782	7baf67e1-67ae-44b0-8f44-a9e670d9260d	Proxima c	planet	150	1	0	1	ice	{"gases": 50, "water": 80}	\N	[]	2026-02-04 23:04:57.444583-05	4
8f028a1f-18a0-4296-aac7-6876871c46f3	7baf67e1-67ae-44b0-8f44-a9e670d9260d	Mining Outpost	station	200	1	0	1	\N	{}	\N	[]	2026-02-04 23:04:57.444583-05	4
2f469b58-9622-439f-8b0a-b5629e3fd4d1	4d027f59-4306-4d8f-942d-98f331ebccbd	Sirius Prime	planet	200	1	0	1	terran	{"food": 80, "metals": 40}	\N	[]	2026-02-04 23:04:57.448586-05	4
16978cab-73ec-4ab6-8617-190aeb71a1bc	4d027f59-4306-4d8f-942d-98f331ebccbd	Sirius Station	station	250	1	0	1	\N	{}	\N	["trade", "repair", "refuel", "missions"]	2026-02-04 23:04:57.448586-05	4
97b1890c-dd28-4cfd-93c5-9fbb652f6cf3	4d027f59-4306-4d8f-942d-98f331ebccbd	Forge World	planet	350	1	0	1	lava	{"metals": 100, "rareEarth": 30}	\N	[]	2026-02-04 23:04:57.448586-05	4
00000000-0000-0000-0001-000000000001	00000000-0000-0000-0000-000000000001	Mercury	planet	200	0.8	0	8	barren	{}	\N	[]	2026-02-13 09:47:29.454553-05	2
00000000-0000-0000-0001-000000000002	00000000-0000-0000-0000-000000000001	Venus	planet	350	0.6	2.5	15	lava	{}	\N	[]	2026-02-13 09:47:29.459806-05	3
00000000-0000-0000-0001-000000000003	00000000-0000-0000-0000-000000000001	Earth	planet	500	0.4	1.2	16	terran	{}	\N	[]	2026-02-13 09:47:29.460544-05	4
00000000-0000-0000-0001-000000000004	00000000-0000-0000-0000-000000000001	Luna	moon	40	2	0	5	barren	{}	\N	[]	2026-02-13 09:47:29.461119-05	2
00000000-0000-0000-0001-000000000005	00000000-0000-0000-0000-000000000001	Mars	planet	750	0.3	4	12	desert	{}	\N	[]	2026-02-13 09:47:29.461531-05	4
00000000-0000-0000-0001-000000000006	00000000-0000-0000-0000-000000000001	Asteroid Belt	asteroid_belt	1100	0.15	0	50	rocky	{}	\N	[]	2026-02-13 09:47:29.461954-05	5
00000000-0000-0000-0001-000000000007	00000000-0000-0000-0000-000000000001	Jupiter	planet	1500	0.1	2.8	50	gas_giant	{}	\N	[]	2026-02-13 09:47:29.462637-05	4
00000000-0000-0000-0001-000000000008	00000000-0000-0000-0000-000000000001	Saturn	planet	2000	0.07	5.5	42	gas_giant	{}	\N	[]	2026-02-13 09:47:29.462986-05	4
00000000-0000-0000-0001-000000000009	00000000-0000-0000-0000-000000000001	Luna Station	station	60	1.5	3.14	8	\N	{}	\N	[]	2026-02-13 09:47:29.463354-05	0
\.


--
-- Data for Name: celestial_body_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.celestial_body_aliases (alias, celestial_body_id) FROM stdin;
mercury	00000000-0000-0000-0001-000000000001
venus	00000000-0000-0000-0001-000000000002
earth	00000000-0000-0000-0001-000000000003
luna	00000000-0000-0000-0001-000000000004
moon	00000000-0000-0000-0001-000000000004
mars	00000000-0000-0000-0001-000000000005
asteroid belt	00000000-0000-0000-0001-000000000006
asteroids	00000000-0000-0000-0001-000000000006
jupiter	00000000-0000-0000-0001-000000000007
saturn	00000000-0000-0000-0001-000000000008
luna station	00000000-0000-0000-0001-000000000009
station	00000000-0000-0000-0001-000000000009
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_messages (id, channel_type, channel_id, sender_id, sender_name, content, created_at) FROM stdin;
\.


--
-- Data for Name: crew_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.crew_members (id, user_id, ship_id, name, role, level, experience, health, morale, skill_piloting, skill_engineering, skill_combat, skill_science, assigned_room_id, created_at) FROM stdin;
\.


--
-- Data for Name: deployed_harvesters; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deployed_harvesters (id, user_id, deposit_id, harvester_type, fuel_remaining, storage_current, storage_capacity, harvest_rate, deployed_at, last_calculated_at) FROM stdin;
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.friendships (id, user_id, friend_id, status, created_at) FROM stdin;
\.


--
-- Data for Name: harvest_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.harvest_sessions (id, user_id, ship_id, deposit_id, started_at, ended_at, last_calculated_at, units_harvested, harvest_rate, is_active) FROM stdin;
\.


--
-- Data for Name: hub_instances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hub_instances (id, system_id, current_players, max_players, is_active, created_at) FROM stdin;
65f45e8a-a649-46a3-8da4-e80194122d38	db326e93-ec98-4fe1-ae65-34ba1065b107	0	100	t	2026-02-04 23:04:57.441589-05
6812ba6a-1045-42cc-b6d5-4230f4e4616e	4d027f59-4306-4d8f-942d-98f331ebccbd	0	100	t	2026-02-04 23:04:57.449951-05
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migrations (id, name, executed_at) FROM stdin;
1	001_initial_schema.sql	2026-02-04 23:04:35.936585-05
2	002_add_oauth.sql	2026-02-09 19:33:55.710726-05
\.


--
-- Data for Name: mission_instances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mission_instances (id, mission_type, difficulty, leader_id, player_ids, max_players, status, state_data, rewards, started_at, completed_at, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: planet_resource_affinities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.planet_resource_affinities (id, planet_type, resource_type_id, spawn_weight, is_primary) FROM stdin;
1	rocky	1	100	t
2	rocky	3	80	t
3	rocky	2	60	f
4	rocky	5	15	f
5	rocky	18	3	f
6	barren	1	100	t
7	barren	2	90	t
8	barren	5	25	f
9	barren	18	5	f
10	gas_giant	6	100	t
11	gas_giant	7	60	t
12	gas_giant	10	50	f
13	gas_giant	8	20	f
14	ice	9	100	t
15	ice	4	70	t
16	ice	7	30	f
17	lava	1	100	t
18	lava	3	80	t
19	lava	8	35	f
20	terran	11	100	t
21	terran	1	60	f
22	terran	12	25	f
23	terran	14	20	f
24	ocean	13	100	t
25	ocean	11	80	t
26	ocean	12	30	f
27	desert	1	100	t
28	desert	3	70	t
29	desert	15	40	f
30	asteroid_belt	1	100	t
31	asteroid_belt	2	90	t
32	asteroid_belt	4	50	f
33	asteroid_belt	18	10	f
34	anomaly	19	100	t
35	anomaly	17	80	t
36	anomaly	16	60	f
\.


--
-- Data for Name: player_presence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.player_presence (user_id, socket_id, location_type, location_id, active_ship_id, connected_at, last_heartbeat) FROM stdin;
\.


--
-- Data for Name: player_research; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.player_research (id, user_id, tech_id, unlocked_at) FROM stdin;
\.


--
-- Data for Name: player_resource_inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.player_resource_inventory (id, user_id, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density, acquired_at, updated_at) FROM stdin;
\.


--
-- Data for Name: player_resources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.player_resources (id, user_id, credits, metals, crystals, gases, rare_earth, fuel, food, electronics, components, updated_at, scanner_probes, advanced_scanner_probes) FROM stdin;
cbe4c206-aafa-4414-8b83-c04bdeeb4117	34867889-4eb6-4dd9-b93a-4a18149c1b65	300	350	100	200	0	300	100	50	12	2026-02-13 11:42:58.314043-05	3	0
\.


--
-- Data for Name: player_surveys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.player_surveys (id, user_id, celestial_body_id, orbital_scanned, ground_scanned, scanned_at) FROM stdin;
b178a93b-2e7b-4bf9-babd-72a6bc7f8733	34867889-4eb6-4dd9-b93a-4a18149c1b65	00000000-0000-0000-0001-000000000005	t	t	2026-02-13 11:36:21.33004-05
6342582a-691a-4e92-873e-d2438e424a6d	34867889-4eb6-4dd9-b93a-4a18149c1b65	00000000-0000-0000-0001-000000000003	t	t	2026-02-13 11:42:58.314954-05
\.


--
-- Data for Name: research_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.research_queue (id, user_id, tech_id, progress, started_at) FROM stdin;
\.


--
-- Data for Name: resource_deposits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_deposits (id, celestial_body_id, resource_type_id, slot_number, quantity_remaining, quantity_total, stat_purity, stat_stability, stat_potency, stat_density, spawned_at, depleted_at) FROM stdin;
ec02db49-e6c4-4721-8ea0-5a4c3688d684	00000000-0000-0000-0001-000000000005	1	1	611	611	25	4	31	87	2026-02-13 11:36:16.449361-05	\N
a57f3e2c-a960-4d2d-81bc-c2c5735aadb0	00000000-0000-0000-0001-000000000005	3	2	572	572	34	19	51	94	2026-02-13 11:36:16.50114-05	\N
5387ff9c-1668-495a-b39a-f00a0c101fdb	00000000-0000-0000-0001-000000000005	3	3	519	519	73	80	54	36	2026-02-13 11:36:16.508034-05	\N
56548d41-d9f9-4814-a015-2ee66104760f	00000000-0000-0000-0001-000000000005	1	4	499	499	54	63	78	83	2026-02-13 11:36:16.515652-05	\N
ce8b54bd-3e5a-445c-8957-46ddb112c5a2	00000000-0000-0000-0001-000000000003	1	1	561	561	31	34	85	94	2026-02-13 11:42:56.641692-05	\N
aa12eba1-f840-446e-bfd7-58107f809a31	00000000-0000-0000-0001-000000000003	1	2	342	342	26	72	78	22	2026-02-13 11:42:56.647064-05	\N
020f45c9-8233-42f1-aa8e-d1065721bf60	00000000-0000-0000-0001-000000000003	11	3	603	603	93	92	28	82	2026-02-13 11:42:56.648783-05	\N
06499e87-57a4-460d-9916-f0ff30524780	00000000-0000-0000-0001-000000000003	1	4	693	693	49	87	86	53	2026-02-13 11:42:56.650727-05	\N
\.


--
-- Data for Name: resource_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_types (id, name, category, rarity, base_price, description, icon, created_at) FROM stdin;
1	Iron	ore	common	10	Common building material found on rocky worlds	iron	2026-02-12 00:22:20.863267-05
2	Titanium	ore	common	25	Lightweight and strong hull material	titanium	2026-02-12 00:22:20.863267-05
3	Copper	ore	common	15	Essential for electronics and wiring	copper	2026-02-12 00:22:20.863267-05
4	Crystite	ore	rare	75	Crystalline energy conductor	crystite	2026-02-12 00:22:20.863267-05
5	Uranium	ore	rare	120	Radioactive fuel source for reactors	uranium	2026-02-12 00:22:20.863267-05
6	Hydrogen	gas	common	8	Basic fuel component	hydrogen	2026-02-12 00:22:20.866392-05
7	Helium-3	gas	rare	90	Advanced fusion fuel	helium3	2026-02-12 00:22:20.866392-05
8	Plasma	gas	rare	150	High-energy ionized gas	plasma	2026-02-12 00:22:20.866392-05
9	Nitrogen	gas	common	12	Life support and chemical synthesis	nitrogen	2026-02-12 00:22:20.866392-05
10	Xenon	gas	common	35	Ion thruster propellant	xenon	2026-02-12 00:22:20.866392-05
11	Biomass	biological	common	18	Organic matter for food and compounds	biomass	2026-02-12 00:22:20.867012-05
12	Spores	biological	rare	85	Alien fungal samples for medicine	spores	2026-02-12 00:22:20.867012-05
13	Coral	biological	common	30	Structural and decorative material	coral	2026-02-12 00:22:20.867012-05
14	Amber Sap	biological	rare	110	Preservative luxury material	ambersap	2026-02-12 00:22:20.867012-05
15	Solar Crystals	energy	rare	95	Natural energy storage crystals	solarcrystal	2026-02-12 00:22:20.867543-05
16	Dark Matter	energy	exotic	500	Mysterious energy source	darkmatter	2026-02-12 00:22:20.867543-05
17	Void Essence	exotic	exotic	750	Reality-bending substance from black holes	voidessence	2026-02-12 00:22:20.868048-05
18	Ancient Alloy	exotic	exotic	400	Precursor technology material	ancientalloy	2026-02-12 00:22:20.868048-05
19	Quantum Dust	exotic	exotic	600	Unstable quantum particles	quantumdust	2026-02-12 00:22:20.868048-05
\.


--
-- Data for Name: ship_designs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ship_designs (id, user_id, name, hull_cells, rooms, hull_size, total_power, total_crew, total_cargo, is_valid, is_public, created_at, updated_at) FROM stdin;
daa3dfe6-215d-465c-acfa-2b8688d10fe1	34867889-4eb6-4dd9-b93a-4a18149c1b65	Alpha Class Frigate	["7,4", "8,4", "6,5", "7,5", "8,5", "9,5", "5,6", "6,6", "7,6", "8,6", "9,6", "10,6", "4,7", "5,7", "6,7", "7,7", "8,7", "9,7", "10,7", "11,7", "4,8", "5,8", "6,8", "7,8", "8,8", "9,8", "10,8", "11,8", "4,9", "5,9", "6,9", "7,9", "8,9", "9,9", "10,9", "11,9", "5,10", "6,10", "7,10", "8,10", "9,10", "10,10", "5,11", "6,11", "9,11", "10,11", "5,12", "6,12", "9,12", "10,12"]	[{"x": 7, "y": 4, "id": "cockpit", "type": "cockpit", "width": 2, "height": 2, "systems": []}, {"x": 7, "y": 6, "id": "crew", "type": "crew", "width": 2, "height": 2, "systems": []}, {"x": 5, "y": 11, "id": "engine", "type": "engine", "width": 2, "height": 2, "systems": []}, {"x": 9, "y": 11, "id": "engine", "type": "engine", "width": 2, "height": 2, "systems": []}, {"x": 6, "y": 9, "id": "reactor", "type": "reactor", "width": 4, "height": 2, "systems": []}]	50	-3	12	0	t	f	2026-02-09 22:17:11.714782-05	2026-02-09 22:17:11.714782-05
edfe6c76-cc52-40a9-a99c-64cc36163989	34867889-4eb6-4dd9-b93a-4a18149c1b65	Turd Rock from the Sun	["4,4", "5,4", "6,4", "7,4", "8,4", "4,5", "5,5", "6,5", "7,5", "8,5", "9,5", "4,6", "5,6", "6,6", "7,6", "8,6", "9,6", "10,6", "5,7", "6,7", "7,7", "8,7", "9,7", "10,7", "6,8", "7,8", "8,8", "9,8", "7,9", "8,9"]	[{"x": 7, "y": 4, "id": "cockpit", "type": "cockpit", "width": 2, "height": 2, "systems": []}, {"x": 5, "y": 4, "id": "crew", "type": "crew", "width": 2, "height": 2, "systems": []}, {"x": 7, "y": 8, "id": "engine", "type": "engine", "width": 2, "height": 2, "systems": []}, {"x": 7, "y": 6, "id": "reactor", "type": "reactor", "width": 2, "height": 2, "systems": []}]	30	-3	10	0	t	f	2026-02-09 22:34:37.087289-05	2026-02-09 22:34:37.087289-05
a8df76cd-8916-4128-a8c3-9758418346ed	34867889-4eb6-4dd9-b93a-4a18149c1b65	Beartlestar Galactica	["6,4", "7,4", "8,4", "9,4", "5,5", "6,5", "7,5", "8,5", "9,5", "10,5", "4,6", "5,6", "6,6", "7,6", "8,6", "9,6", "10,6", "11,6", "4,7", "5,7", "6,7", "7,7", "8,7", "9,7", "10,7", "11,7", "4,8", "5,8", "6,8", "7,8", "8,8", "9,8", "10,8", "11,8", "4,9", "5,9", "6,9", "7,9", "8,9", "9,9", "10,9", "11,9", "5,10", "6,10", "7,10", "8,10", "9,10", "10,10", "6,11", "7,11", "8,11", "9,11"]	[{"x": 7, "y": 4, "id": "cockpit", "type": "cockpit", "width": 2, "height": 2, "systems": []}, {"x": 7, "y": 6, "id": "crew", "type": "crew", "width": 2, "height": 2, "systems": []}, {"x": 6, "y": 10, "id": "engine", "type": "engine", "width": 4, "height": 2, "systems": []}, {"x": 7, "y": 8, "id": "reactor", "type": "reactor", "width": 2, "height": 2, "systems": []}]	52	-3	10	0	t	f	2026-02-13 11:41:46.993832-05	2026-02-13 11:41:46.993832-05
\.


--
-- Data for Name: ships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ships (id, user_id, design_id, name, status, health, shield, fuel, location_type, location_id, position_x, position_y, rotation, velocity_x, velocity_y, cargo, damage_state, created_at, updated_at) FROM stdin;
f02ce127-fe1a-4719-aee4-04751de50b71	34867889-4eb6-4dd9-b93a-4a18149c1b65	edfe6c76-cc52-40a9-a99c-64cc36163989	Turd Rock from the Sun	docked	100	100	100	hub	\N	0	0	0	0	0	{}	{}	2026-02-09 22:35:01.976829-05	2026-02-09 22:35:01.976829-05
\.


--
-- Data for Name: star_systems; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.star_systems (id, name, galaxy_x, galaxy_y, star_type, star_size, is_hub, danger_level, connections, created_at) FROM stdin;
db326e93-ec98-4fe1-ae65-34ba1065b107	Sol	0	0	yellow	1	t	1	["7baf67e1-67ae-44b0-8f44-a9e670d9260d", "4d027f59-4306-4d8f-942d-98f331ebccbd"]	2026-02-04 23:04:57.422029-05
7baf67e1-67ae-44b0-8f44-a9e670d9260d	Alpha Centauri	100	50	red_dwarf	0.8	f	2	["db326e93-ec98-4fe1-ae65-34ba1065b107"]	2026-02-04 23:04:57.443654-05
4d027f59-4306-4d8f-942d-98f331ebccbd	Sirius	-80	120	blue_giant	1.5	t	3	["db326e93-ec98-4fe1-ae65-34ba1065b107"]	2026-02-04 23:04:57.447859-05
00000000-0000-0000-0000-000000000001	Sol	0	0	yellow	60	t	1	[]	2026-02-13 09:47:29.451665-05
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, email, password_hash, display_name, avatar_url, credits, total_playtime_seconds, is_online, last_seen_at, created_at, updated_at, auth_provider, oauth_id) FROM stdin;
34867889-4eb6-4dd9-b93a-4a18149c1b65	Jay__OHMSS__Hess	infiniteearths.com@gmail.com	\N	Jay “OHMSS” Hess	https://lh3.googleusercontent.com/a/ACg8ocKBt-cNXD26v_XLsqs7oTKsQ1nke0SOWkCfD4quyoU0b7Ty5DQ=s96-c	1000	0	f	\N	2026-02-09 22:10:42.951699-05	2026-02-13 11:41:01.052809-05	google	111198331832497175271
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.migrations_id_seq', 2, true);


--
-- Name: planet_resource_affinities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.planet_resource_affinities_id_seq', 36, true);


--
-- Name: resource_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.resource_types_id_seq', 19, true);


--
-- Name: celestial_bodies celestial_bodies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celestial_bodies
    ADD CONSTRAINT celestial_bodies_pkey PRIMARY KEY (id);


--
-- Name: celestial_body_aliases celestial_body_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celestial_body_aliases
    ADD CONSTRAINT celestial_body_aliases_pkey PRIMARY KEY (alias);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: crew_members crew_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.crew_members
    ADD CONSTRAINT crew_members_pkey PRIMARY KEY (id);


--
-- Name: deployed_harvesters deployed_harvesters_deposit_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deployed_harvesters
    ADD CONSTRAINT deployed_harvesters_deposit_id_key UNIQUE (deposit_id);


--
-- Name: deployed_harvesters deployed_harvesters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deployed_harvesters
    ADD CONSTRAINT deployed_harvesters_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_friend_id_key UNIQUE (user_id, friend_id);


--
-- Name: harvest_sessions harvest_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.harvest_sessions
    ADD CONSTRAINT harvest_sessions_pkey PRIMARY KEY (id);


--
-- Name: hub_instances hub_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hub_instances
    ADD CONSTRAINT hub_instances_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: mission_instances mission_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mission_instances
    ADD CONSTRAINT mission_instances_pkey PRIMARY KEY (id);


--
-- Name: planet_resource_affinities planet_resource_affinities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planet_resource_affinities
    ADD CONSTRAINT planet_resource_affinities_pkey PRIMARY KEY (id);


--
-- Name: planet_resource_affinities planet_resource_affinities_planet_type_resource_type_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planet_resource_affinities
    ADD CONSTRAINT planet_resource_affinities_planet_type_resource_type_id_key UNIQUE (planet_type, resource_type_id);


--
-- Name: player_presence player_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_presence
    ADD CONSTRAINT player_presence_pkey PRIMARY KEY (user_id);


--
-- Name: player_research player_research_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_research
    ADD CONSTRAINT player_research_pkey PRIMARY KEY (id);


--
-- Name: player_research player_research_user_id_tech_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_research
    ADD CONSTRAINT player_research_user_id_tech_id_key UNIQUE (user_id, tech_id);


--
-- Name: player_resource_inventory player_resource_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resource_inventory
    ADD CONSTRAINT player_resource_inventory_pkey PRIMARY KEY (id);


--
-- Name: player_resource_inventory player_resource_inventory_user_id_resource_type_id_stat_pur_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resource_inventory
    ADD CONSTRAINT player_resource_inventory_user_id_resource_type_id_stat_pur_key UNIQUE (user_id, resource_type_id, stat_purity, stat_stability, stat_potency, stat_density);


--
-- Name: player_resources player_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resources
    ADD CONSTRAINT player_resources_pkey PRIMARY KEY (id);


--
-- Name: player_resources player_resources_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resources
    ADD CONSTRAINT player_resources_user_id_key UNIQUE (user_id);


--
-- Name: player_surveys player_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_surveys
    ADD CONSTRAINT player_surveys_pkey PRIMARY KEY (id);


--
-- Name: player_surveys player_surveys_user_id_celestial_body_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_surveys
    ADD CONSTRAINT player_surveys_user_id_celestial_body_id_key UNIQUE (user_id, celestial_body_id);


--
-- Name: research_queue research_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.research_queue
    ADD CONSTRAINT research_queue_pkey PRIMARY KEY (id);


--
-- Name: research_queue research_queue_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.research_queue
    ADD CONSTRAINT research_queue_user_id_key UNIQUE (user_id);


--
-- Name: resource_deposits resource_deposits_celestial_body_id_slot_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_deposits
    ADD CONSTRAINT resource_deposits_celestial_body_id_slot_number_key UNIQUE (celestial_body_id, slot_number);


--
-- Name: resource_deposits resource_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_deposits
    ADD CONSTRAINT resource_deposits_pkey PRIMARY KEY (id);


--
-- Name: resource_types resource_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_types
    ADD CONSTRAINT resource_types_name_key UNIQUE (name);


--
-- Name: resource_types resource_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_types
    ADD CONSTRAINT resource_types_pkey PRIMARY KEY (id);


--
-- Name: ship_designs ship_designs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ship_designs
    ADD CONSTRAINT ship_designs_pkey PRIMARY KEY (id);


--
-- Name: ships ships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (id);


--
-- Name: star_systems star_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.star_systems
    ADD CONSTRAINT star_systems_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_affinities_planet_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_affinities_planet_type ON public.planet_resource_affinities USING btree (planet_type);


--
-- Name: idx_bodies_system; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bodies_system ON public.celestial_bodies USING btree (system_id);


--
-- Name: idx_chat_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_channel ON public.chat_messages USING btree (channel_type, channel_id, created_at DESC);


--
-- Name: idx_crew_ship; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_crew_ship ON public.crew_members USING btree (ship_id);


--
-- Name: idx_crew_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_crew_user ON public.crew_members USING btree (user_id);


--
-- Name: idx_deposits_body; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deposits_body ON public.resource_deposits USING btree (celestial_body_id);


--
-- Name: idx_deposits_depleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deposits_depleted ON public.resource_deposits USING btree (depleted_at) WHERE (depleted_at IS NOT NULL);


--
-- Name: idx_deposits_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deposits_resource ON public.resource_deposits USING btree (resource_type_id);


--
-- Name: idx_friends_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_friends_user ON public.friendships USING btree (user_id, status);


--
-- Name: idx_harvest_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_harvest_active ON public.harvest_sessions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_harvest_deposit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_harvest_deposit ON public.harvest_sessions USING btree (deposit_id);


--
-- Name: idx_harvest_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_harvest_user ON public.harvest_sessions USING btree (user_id);


--
-- Name: idx_harvesters_deposit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_harvesters_deposit ON public.deployed_harvesters USING btree (deposit_id);


--
-- Name: idx_harvesters_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_harvesters_user ON public.deployed_harvesters USING btree (user_id);


--
-- Name: idx_hubs_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hubs_active ON public.hub_instances USING btree (is_active, current_players);


--
-- Name: idx_hubs_system; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hubs_system ON public.hub_instances USING btree (system_id);


--
-- Name: idx_inventory_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_resource ON public.player_resource_inventory USING btree (resource_type_id);


--
-- Name: idx_inventory_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_user ON public.player_resource_inventory USING btree (user_id);


--
-- Name: idx_missions_leader; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_missions_leader ON public.mission_instances USING btree (leader_id);


--
-- Name: idx_missions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_missions_status ON public.mission_instances USING btree (status);


--
-- Name: idx_presence_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presence_location ON public.player_presence USING btree (location_type, location_id);


--
-- Name: idx_research_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_research_user ON public.player_research USING btree (user_id);


--
-- Name: idx_resource_types_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resource_types_category ON public.resource_types USING btree (category);


--
-- Name: idx_resource_types_rarity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resource_types_rarity ON public.resource_types USING btree (rarity);


--
-- Name: idx_ship_designs_public; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ship_designs_public ON public.ship_designs USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_ship_designs_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ship_designs_user ON public.ship_designs USING btree (user_id);


--
-- Name: idx_ships_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ships_location ON public.ships USING btree (location_type, location_id);


--
-- Name: idx_ships_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ships_user ON public.ships USING btree (user_id);


--
-- Name: idx_surveys_body; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_surveys_body ON public.player_surveys USING btree (celestial_body_id);


--
-- Name: idx_surveys_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_surveys_user ON public.player_surveys USING btree (user_id);


--
-- Name: idx_systems_hub; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_systems_hub ON public.star_systems USING btree (is_hub) WHERE (is_hub = true);


--
-- Name: idx_systems_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_systems_position ON public.star_systems USING btree (galaxy_x, galaxy_y);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_oauth; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_oauth ON public.users USING btree (auth_provider, oauth_id);


--
-- Name: idx_users_online; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_online ON public.users USING btree (is_online) WHERE (is_online = true);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: player_resource_inventory player_resource_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER player_resource_inventory_updated_at BEFORE UPDATE ON public.player_resource_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: player_resources player_resources_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER player_resources_updated_at BEFORE UPDATE ON public.player_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: ship_designs ship_designs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER ship_designs_updated_at BEFORE UPDATE ON public.ship_designs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: ships ships_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER ships_updated_at BEFORE UPDATE ON public.ships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: celestial_bodies celestial_bodies_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celestial_bodies
    ADD CONSTRAINT celestial_bodies_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.star_systems(id) ON DELETE CASCADE;


--
-- Name: celestial_body_aliases celestial_body_aliases_celestial_body_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celestial_body_aliases
    ADD CONSTRAINT celestial_body_aliases_celestial_body_id_fkey FOREIGN KEY (celestial_body_id) REFERENCES public.celestial_bodies(id);


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: crew_members crew_members_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.crew_members
    ADD CONSTRAINT crew_members_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(id) ON DELETE SET NULL;


--
-- Name: crew_members crew_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.crew_members
    ADD CONSTRAINT crew_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deployed_harvesters deployed_harvesters_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deployed_harvesters
    ADD CONSTRAINT deployed_harvesters_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.resource_deposits(id) ON DELETE CASCADE;


--
-- Name: deployed_harvesters deployed_harvesters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deployed_harvesters
    ADD CONSTRAINT deployed_harvesters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: harvest_sessions harvest_sessions_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.harvest_sessions
    ADD CONSTRAINT harvest_sessions_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.resource_deposits(id) ON DELETE CASCADE;


--
-- Name: harvest_sessions harvest_sessions_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.harvest_sessions
    ADD CONSTRAINT harvest_sessions_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(id) ON DELETE CASCADE;


--
-- Name: harvest_sessions harvest_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.harvest_sessions
    ADD CONSTRAINT harvest_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hub_instances hub_instances_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hub_instances
    ADD CONSTRAINT hub_instances_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.star_systems(id);


--
-- Name: mission_instances mission_instances_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mission_instances
    ADD CONSTRAINT mission_instances_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.users(id);


--
-- Name: planet_resource_affinities planet_resource_affinities_resource_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planet_resource_affinities
    ADD CONSTRAINT planet_resource_affinities_resource_type_id_fkey FOREIGN KEY (resource_type_id) REFERENCES public.resource_types(id) ON DELETE CASCADE;


--
-- Name: player_presence player_presence_active_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_presence
    ADD CONSTRAINT player_presence_active_ship_id_fkey FOREIGN KEY (active_ship_id) REFERENCES public.ships(id);


--
-- Name: player_presence player_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_presence
    ADD CONSTRAINT player_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: player_research player_research_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_research
    ADD CONSTRAINT player_research_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: player_resource_inventory player_resource_inventory_resource_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resource_inventory
    ADD CONSTRAINT player_resource_inventory_resource_type_id_fkey FOREIGN KEY (resource_type_id) REFERENCES public.resource_types(id);


--
-- Name: player_resource_inventory player_resource_inventory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resource_inventory
    ADD CONSTRAINT player_resource_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: player_resources player_resources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_resources
    ADD CONSTRAINT player_resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: player_surveys player_surveys_celestial_body_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_surveys
    ADD CONSTRAINT player_surveys_celestial_body_id_fkey FOREIGN KEY (celestial_body_id) REFERENCES public.celestial_bodies(id) ON DELETE CASCADE;


--
-- Name: player_surveys player_surveys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.player_surveys
    ADD CONSTRAINT player_surveys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: research_queue research_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.research_queue
    ADD CONSTRAINT research_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resource_deposits resource_deposits_celestial_body_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_deposits
    ADD CONSTRAINT resource_deposits_celestial_body_id_fkey FOREIGN KEY (celestial_body_id) REFERENCES public.celestial_bodies(id) ON DELETE CASCADE;


--
-- Name: resource_deposits resource_deposits_resource_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_deposits
    ADD CONSTRAINT resource_deposits_resource_type_id_fkey FOREIGN KEY (resource_type_id) REFERENCES public.resource_types(id);


--
-- Name: ship_designs ship_designs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ship_designs
    ADD CONSTRAINT ship_designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ships ships_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.ship_designs(id);


--
-- Name: ships ships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict MibPcREeH6YNykbFBAEWcxWe7PVc4dNBLhi6hE16uk3T4DnloBDQxKATRP48xcq

