CREATE TABLE "sso_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'okta' NOT NULL,
	"domain" varchar(255) NOT NULL,
	"idp_metadata_url" varchar(2048),
	"client_id" varchar(255),
	"client_secret" varchar(255),
	"scim_enabled" boolean DEFAULT false NOT NULL,
	"scim_token" varchar(255),
	"enforce_sso" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "sso_configurations_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "sso_configurations" ADD CONSTRAINT "sso_configurations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;