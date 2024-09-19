import { Lucia, Session, User } from "lucia";

import { MongodbAdapter } from "@lucia-auth/adapter-mongodb";
import client, { sessionCollection, userCollection } from "../mongodb";
import { cookies } from "next/headers";
import { cache } from "react";

const adapter = new MongodbAdapter(sessionCollection, userCollection);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		expires: process.env.NODE_ENV === "production" ? true : false,
		attributes: {
			// set to `true` when using HTTPS
			secure: process.env.NODE_ENV === "production",
		}
	},
	getUserAttributes: (attributes) => {
		return {
			name: attributes.name,
			username: attributes.username,
			email: attributes.email,
			email_verified: attributes.email_verified,
			avatar: attributes.avatar,
			banner: attributes.banner,
			two_factor_secret: attributes.two_factor_secret
		}
	}
});

export const validateRequest = cache(
	async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
		const sessionId = cookies().get(lucia.sessionCookieName)?.value ?? null;
		if (!sessionId) {
			return {
				user: null,
				session: null
			};
		}

		await client.connect();

		const result = await lucia.validateSession(sessionId);
		// next.js throws when you attempt to set cookie when rendering page
		try {
			if (result.session && result.session.fresh) {
				const sessionCookie = lucia.createSessionCookie(result.session.id);
				cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			}
			if (!result.session) {
				const sessionCookie = lucia.createBlankSessionCookie();
				cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			}
		} catch { }

		return result;
	}
);

export const getUser = cache(
	async (): Promise<User | null> => {
		"use server";
		const { user } = await validateRequest();
		return user;
	}
);

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		UserId: string;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	name: string;
	username: string;
	email: string;
	email_verified: boolean;
	avatar: string;
	banner: string;
	two_factor_secret: string | null;
}