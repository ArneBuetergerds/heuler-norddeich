import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Nutzung: npx tsx scripts/hash-password.ts <passwort>");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log(hash);
});
