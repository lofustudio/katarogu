"use server";

import { ActionResult } from "@/components/form";
import client from "@/lib/mongodb";
import { redirect } from "next/navigation";
import { render } from "jsx-email";
import { alphabet, generateRandomString } from "oslo/crypto";
import VerifyAccountEmail from "@/auth/verify/email";
import { createTransport } from "nodemailer";
import { createSession, generateSessionToken, getCurrentSession, invalidateSession, UsersCollection } from "../sessions";
import { setSessionTokenCookie } from "../cookies";

// Email actions
export async function generateEmailVerificationCode(userId: string, email: string): Promise<string> {
	await client.connect();

	// Remove all existing codes for this email
	const existing_codes = client.db().collection("verification_codes").find({ $or: [{ email: email }, { user_id: userId }] });

	for await (const code of existing_codes) {
		await client.db().collection("verification_codes").deleteOne({ _id: code._id });
	}

	// Generate a new code
	const code = generateRandomString(6, alphabet("0-9"));

	// Insert the new code
	await client.db().collection("verification_codes").insertOne({
		user_id: userId,
		email,
		code,
		expires_at: new Date(Date.now() + 1000 * 60 * 15) // 15 minutes
	});

	await client.close();

	return code;
}

export async function sendVerificationEmail(email: string, code: string) {
	const transporter = createTransport({
		host: process.env.SMTP_HOST,
		secure: process.env.SMTP_SECURE === "true",
		port: parseInt(process.env.SMTP_PORT!),
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASSWORD
		},
		debug: process.env.NODE_ENV === "development"
	});

	const body = await render(<VerifyAccountEmail verificationCode={code} />);

	const info = await transporter.sendMail({
		from: process.env.SMTP_FROM,
		to: email,
		subject: "Verify your account",
		html: body
	});

	await transporter.sendMail(info).catch((err) => {
		console.error(err);
	});
}

// Server actions
export async function verifyAccount(_: unknown, formData: FormData): Promise<ActionResult> {
	"use server";
	const { user } = await getCurrentSession();

	if (!user) {
		return {
			error: true,
			message: "Unauthorized"
		};
	}

	const code = formData.get("code");
	console.log(code)
	if (typeof code !== "string" || code.length !== 6) {
		return {
			error: true,
			message: "Invalid code"
		};
	}

	// Find a code that matches the user's email or the user's ID
	const validCode = await client.db().collection("verification_codes").findOne({ $or: [{ email: user.email }, { user_id: user.id }] });
	console.log(validCode)

	if (!validCode) {
		return {
			error: true,
			message: "Invalid code"
		};
	}

	// check if the validCode hasn't expired
	if (validCode.expires_at < new Date()) {
		return {
			error: true,
			message: "Code has expired. Please request a new one."
		};
	}

	if (validCode.code !== code) {
		return {
			error: true,
			message: "Invalid code"
		};
	}

	// Delete the code
	await client.db().collection("verification_codes").deleteOne({ _id: validCode._id });

	await invalidateSession(user.id);
	await client.db().collection<UsersCollection>("users").updateOne({ _id: user.id }, { $set: { email_verified: true } });

	const sessionToken = generateSessionToken();
	const session = await createSession(sessionToken, user.id);
	setSessionTokenCookie(sessionToken, session.expires_at);

	return redirect("/auth/verify/success");
}

export async function resendVerificationEmail() {
	"use server";
	const { user } = await getCurrentSession();

	if (!user) {
		return {
			message: "Unauthorized"
		}
	};

	if (user.email_verified) {
		return {
			message: "Your account is already verified"
		}
	}

	const code = await generateEmailVerificationCode(user.id, user.email);

	await sendVerificationEmail(user.email, code);
}