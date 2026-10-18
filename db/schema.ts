import {sqliteTable,text,integer,index,uniqueIndex} from "drizzle-orm/sqlite-core";

export const aslRooms=sqliteTable("asl_rooms",{
 code:text("code").primaryKey(),
 ownerKey:text("owner_key").notNull(),
 state:text("state").notNull(),
 revision:integer("revision").notNull().default(0),
 expiresAt:integer("expires_at").notNull(),
},table=>[uniqueIndex("idx_asl_rooms_owner_key").on(table.ownerKey),index("idx_asl_rooms_expires_at").on(table.expiresAt)]);

export const partyRooms=sqliteTable("party_rooms",{
 code:text("code").primaryKey(),
 ownerKey:text("owner_key").notNull(),
 state:text("state").notNull(),
 revision:integer("revision").notNull().default(0),
 expiresAt:integer("expires_at").notNull(),
},table=>[uniqueIndex("idx_party_rooms_owner_key").on(table.ownerKey),index("idx_party_rooms_expires_at").on(table.expiresAt)]);

export const ritualRooms=sqliteTable("ritual_rooms",{
 code:text("code").primaryKey(),
 ownerKey:text("owner_key").notNull(),
 state:text("state").notNull(),
 revision:integer("revision").notNull().default(0),
 expiresAt:integer("expires_at").notNull(),
},table=>[uniqueIndex("idx_ritual_rooms_owner_key").on(table.ownerKey),index("idx_ritual_rooms_expires_at").on(table.expiresAt)]);
