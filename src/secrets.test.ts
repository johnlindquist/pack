import { describe, test, expect } from "bun:test";
import {
  detectSecrets,
  redactSecrets,
  createRedactionMarker,
  createRedactionReport,
  formatRedactionReport,
  mightContainSecrets,
  createSecretTransforms,
  SECRET_PATTERNS,
  type SecretType,
  type DetectedSecret,
} from "./secrets";

describe("SECRET_PATTERNS", () => {
  describe("AWS_ACCESS_KEY", () => {
    test("detects valid AWS access key", () => {
      const content = "AKIAIOSFODNN7EXAMPLE";
      expect(SECRET_PATTERNS.AWS_ACCESS_KEY.test(content)).toBe(true);
    });

    test("does not match partial AWS key", () => {
      const content = "AKIA123"; // Too short
      SECRET_PATTERNS.AWS_ACCESS_KEY.lastIndex = 0;
      expect(SECRET_PATTERNS.AWS_ACCESS_KEY.test(content)).toBe(false);
    });
  });

  describe("GITHUB_TOKEN", () => {
    test("detects GitHub personal access token (ghp_)", () => {
      const content = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12";
      expect(SECRET_PATTERNS.GITHUB_TOKEN.test(content)).toBe(true);
    });

    test("detects GitHub OAuth token (gho_)", () => {
      const content = "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12";
      SECRET_PATTERNS.GITHUB_TOKEN.lastIndex = 0;
      expect(SECRET_PATTERNS.GITHUB_TOKEN.test(content)).toBe(true);
    });

    test("detects GitHub user token (ghu_)", () => {
      const content = "ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12";
      SECRET_PATTERNS.GITHUB_TOKEN.lastIndex = 0;
      expect(SECRET_PATTERNS.GITHUB_TOKEN.test(content)).toBe(true);
    });

    test("detects GitHub server token (ghs_)", () => {
      const content = "ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12";
      SECRET_PATTERNS.GITHUB_TOKEN.lastIndex = 0;
      expect(SECRET_PATTERNS.GITHUB_TOKEN.test(content)).toBe(true);
    });

    test("detects GitHub refresh token (ghr_)", () => {
      const content = "ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12";
      SECRET_PATTERNS.GITHUB_TOKEN.lastIndex = 0;
      expect(SECRET_PATTERNS.GITHUB_TOKEN.test(content)).toBe(true);
    });
  });

  describe("STRIPE_KEY", () => {
    test("detects Stripe live key", () => {
      const content = "sk_live_abcdefghijklmnopqrstuvwx";
      expect(SECRET_PATTERNS.STRIPE_KEY.test(content)).toBe(true);
    });

    test("detects Stripe test key", () => {
      const content = "sk_test_abcdefghijklmnopqrstuvwx";
      SECRET_PATTERNS.STRIPE_SECRET.lastIndex = 0;
      expect(SECRET_PATTERNS.STRIPE_SECRET.test(content)).toBe(true);
    });
  });

  describe("PRIVATE_KEY", () => {
    test("detects RSA private key", () => {
      const content = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBALRiMLAHudeSA...
-----END RSA PRIVATE KEY-----`;
      expect(SECRET_PATTERNS.PRIVATE_KEY.test(content)).toBe(true);
    });

    test("detects generic private key", () => {
      const content = `-----BEGIN PRIVATE KEY-----
MIIBOgIBAAJBALRiMLAHudeSA...
-----END PRIVATE KEY-----`;
      SECRET_PATTERNS.PRIVATE_KEY.lastIndex = 0;
      expect(SECRET_PATTERNS.PRIVATE_KEY.test(content)).toBe(true);
    });

    test("detects OpenSSH private key", () => {
      const content = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbm...
-----END OPENSSH PRIVATE KEY-----`;
      SECRET_PATTERNS.PRIVATE_KEY.lastIndex = 0;
      expect(SECRET_PATTERNS.PRIVATE_KEY.test(content)).toBe(true);
    });
  });

  describe("JWT", () => {
    test("detects JWT token", () => {
      const content = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      expect(SECRET_PATTERNS.JWT.test(content)).toBe(true);
    });
  });

  describe("CONNECTION_STRING", () => {
    test("detects MongoDB connection string", () => {
      const content = "mongodb://user:password@localhost:27017/database";
      expect(SECRET_PATTERNS.CONNECTION_STRING.test(content)).toBe(true);
    });

    test("detects MongoDB+srv connection string", () => {
      const content = "mongodb+srv://user:password@cluster.mongodb.net/database";
      SECRET_PATTERNS.CONNECTION_STRING.lastIndex = 0;
      expect(SECRET_PATTERNS.CONNECTION_STRING.test(content)).toBe(true);
    });

    test("detects PostgreSQL connection string", () => {
      const content = "postgres://user:password@localhost:5432/database";
      SECRET_PATTERNS.CONNECTION_STRING.lastIndex = 0;
      expect(SECRET_PATTERNS.CONNECTION_STRING.test(content)).toBe(true);
    });

    test("detects MySQL connection string", () => {
      const content = "mysql://user:password@localhost:3306/database";
      SECRET_PATTERNS.CONNECTION_STRING.lastIndex = 0;
      expect(SECRET_PATTERNS.CONNECTION_STRING.test(content)).toBe(true);
    });

    test("detects Redis connection string", () => {
      const content = "redis://user:password@localhost:6379";
      SECRET_PATTERNS.CONNECTION_STRING.lastIndex = 0;
      expect(SECRET_PATTERNS.CONNECTION_STRING.test(content)).toBe(true);
    });
  });

  describe("SLACK_TOKEN", () => {
    test("detects Slack bot token", () => {
      const content = "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx";
      expect(SECRET_PATTERNS.SLACK_TOKEN.test(content)).toBe(true);
    });

    test("detects Slack app token", () => {
      const content = "xoxa-1234567890-1234567890123-abcdefghijklmnopqrstuvwx";
      SECRET_PATTERNS.SLACK_TOKEN.lastIndex = 0;
      expect(SECRET_PATTERNS.SLACK_TOKEN.test(content)).toBe(true);
    });
  });

  describe("SENDGRID_KEY", () => {
    test("detects SendGrid API key", () => {
      const content = "SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      expect(SECRET_PATTERNS.SENDGRID_KEY.test(content)).toBe(true);
    });
  });

  describe("GOOGLE_API_KEY", () => {
    test("detects Google API key", () => {
      const content = "AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe";
      expect(SECRET_PATTERNS.GOOGLE_API_KEY.test(content)).toBe(true);
    });
  });

  describe("NPM_TOKEN", () => {
    test("detects NPM token", () => {
      const content = "npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      expect(SECRET_PATTERNS.NPM_TOKEN.test(content)).toBe(true);
    });
  });
});

describe("createRedactionMarker", () => {
  test("creates correct marker format", () => {
    expect(createRedactionMarker("AWS_ACCESS_KEY")).toBe("<REDACTED:AWS_ACCESS_KEY>");
    expect(createRedactionMarker("GITHUB_TOKEN")).toBe("<REDACTED:GITHUB_TOKEN>");
    expect(createRedactionMarker("JWT")).toBe("<REDACTED:JWT>");
  });
});

describe("detectSecrets", () => {
  test("detects AWS access key in content", () => {
    const content = `const config = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  region: "us-east-1"
};`;
    const detected = detectSecrets(content);
    expect(detected.length).toBeGreaterThan(0);
    expect(detected.some(d => d.type === "AWS_ACCESS_KEY")).toBe(true);
  });

  test("detects multiple secrets in content", () => {
    const content = `
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12
AWS_KEY=AKIAIOSFODNN7EXAMPLE
`;
    const detected = detectSecrets(content);
    expect(detected.some(d => d.type === "GITHUB_TOKEN")).toBe(true);
    expect(detected.some(d => d.type === "AWS_ACCESS_KEY")).toBe(true);
  });

  test("returns line and column information", () => {
    const content = `line 1
AKIAIOSFODNN7EXAMPLE on line 2`;
    const detected = detectSecrets(content);
    expect(detected.length).toBeGreaterThan(0);
    expect(detected[0].line).toBe(2);
  });

  test("returns empty array for content without secrets", () => {
    const content = `const greeting = "Hello, World!";
console.log(greeting);`;
    const detected = detectSecrets(content);
    // Filter out false positives (generic patterns might match)
    const realSecrets = detected.filter(d =>
      !d.type.startsWith("GENERIC") &&
      !d.type.startsWith("ENV") &&
      !d.type.startsWith("PASSWORD")
    );
    expect(realSecrets.length).toBe(0);
  });
});

describe("redactSecrets", () => {
  test("redacts AWS access key", () => {
    const content = `accessKeyId: "AKIAIOSFODNN7EXAMPLE"`;
    const { content: redacted, detected } = redactSecrets(content);
    expect(redacted).toContain("<REDACTED:AWS_ACCESS_KEY>");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(detected.length).toBeGreaterThan(0);
  });

  test("redacts GitHub token", () => {
    const content = `GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12`;
    const { content: redacted } = redactSecrets(content);
    expect(redacted).toContain("<REDACTED:GITHUB_TOKEN>");
    expect(redacted).not.toContain("ghp_");
  });

  test("redacts JWT token", () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const content = `Authorization: Bearer ${token}`;
    const { content: redacted } = redactSecrets(content);
    expect(redacted).toContain("<REDACTED:JWT>");
    expect(redacted).not.toContain("eyJhbGci");
  });

  test("redacts private key", () => {
    const content = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBALRiMLAHudeSA...
more key content...
-----END RSA PRIVATE KEY-----`;
    const { content: redacted } = redactSecrets(content);
    expect(redacted).toContain("<REDACTED:PRIVATE_KEY>");
    expect(redacted).not.toContain("MIIBOgIBAAJBALRiMLAHudeSA");
  });

  test("redacts connection string", () => {
    const content = `DATABASE_URL=mongodb://admin:secretpassword@cluster.mongodb.net/mydb`;
    const { content: redacted } = redactSecrets(content);
    expect(redacted).toContain("<REDACTED:CONNECTION_STRING>");
    expect(redacted).not.toContain("secretpassword");
  });

  test("preserves non-secret content", () => {
    const content = `const greeting = "Hello, World!";
const apiKey = "AKIAIOSFODNN7EXAMPLE";
console.log(greeting);`;
    const { content: redacted } = redactSecrets(content);
    expect(redacted).toContain("Hello, World!");
    expect(redacted).toContain("console.log(greeting);");
  });

  test("returns original content when no secrets found", () => {
    const content = `const x = 1;
const y = 2;
console.log(x + y);`;
    const { content: redacted, detected } = redactSecrets(content);
    expect(redacted).toBe(content);
    expect(detected.length).toBe(0);
  });

  test("handles multiple occurrences of same secret", () => {
    const content = `
key1: AKIAIOSFODNN7EXAMPLE
key2: AKIAIOSFODNN7EXAMPLE
`;
    const { content: redacted } = redactSecrets(content);
    const matches = redacted.match(/<REDACTED:AWS_ACCESS_KEY>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});

describe("createRedactionReport", () => {
  test("creates report from detected secrets", () => {
    const fileSecrets = new Map<string, DetectedSecret[]>();
    fileSecrets.set("config.ts", [
      { type: "AWS_ACCESS_KEY" as SecretType, match: "AKIA...", line: 1, column: 0, redactedValue: "<REDACTED:AWS_ACCESS_KEY>" },
      { type: "GITHUB_TOKEN" as SecretType, match: "ghp_...", line: 2, column: 0, redactedValue: "<REDACTED:GITHUB_TOKEN>" },
    ]);
    fileSecrets.set("env.ts", [
      { type: "AWS_ACCESS_KEY" as SecretType, match: "AKIA...", line: 1, column: 0, redactedValue: "<REDACTED:AWS_ACCESS_KEY>" },
    ]);

    const report = createRedactionReport(fileSecrets);

    expect(report.totalSecrets).toBe(3);
    expect(report.byType.AWS_ACCESS_KEY).toBe(2);
    expect(report.byType.GITHUB_TOKEN).toBe(1);
    expect(report.files.size).toBe(2);
  });

  test("handles empty secrets map", () => {
    const report = createRedactionReport(new Map());
    expect(report.totalSecrets).toBe(0);
    expect(Object.keys(report.byType).length).toBe(0);
  });
});

describe("formatRedactionReport", () => {
  test("formats report with secrets", () => {
    const fileSecrets = new Map<string, DetectedSecret[]>();
    fileSecrets.set("config.ts", [
      { type: "AWS_ACCESS_KEY" as SecretType, match: "AKIA...", line: 1, column: 0, redactedValue: "<REDACTED:AWS_ACCESS_KEY>" },
    ]);

    const report = createRedactionReport(fileSecrets);
    const formatted = formatRedactionReport(report);

    expect(formatted).toContain("SECRET REDACTION REPORT");
    expect(formatted).toContain("Total secrets redacted: 1");
    expect(formatted).toContain("AWS_ACCESS_KEY: 1");
    expect(formatted).toContain("config.ts: 1 secret(s)");
  });

  test("returns message for no secrets", () => {
    const report = createRedactionReport(new Map());
    const formatted = formatRedactionReport(report);

    expect(formatted).toBe("No secrets detected.");
  });
});

describe("mightContainSecrets", () => {
  test("returns true for content with AWS key prefix", () => {
    expect(mightContainSecrets("AKIAIOSFODNN")).toBe(true);
  });

  test("returns true for content with GitHub token prefix", () => {
    expect(mightContainSecrets("ghp_something")).toBe(true);
  });

  test("returns true for content with sk- prefix", () => {
    expect(mightContainSecrets("sk-abc123")).toBe(true);
  });

  test("returns true for content with private key marker", () => {
    expect(mightContainSecrets("-----BEGIN PRIVATE KEY-----")).toBe(true);
  });

  test("returns true for content with JWT pattern", () => {
    expect(mightContainSecrets("eyJhbGci.eyJsb2dpbiI")).toBe(true);
  });

  test("returns true for content with connection string", () => {
    expect(mightContainSecrets("mongodb://localhost")).toBe(true);
    expect(mightContainSecrets("postgres://localhost")).toBe(true);
    expect(mightContainSecrets("mysql://localhost")).toBe(true);
    expect(mightContainSecrets("redis://localhost")).toBe(true);
  });

  test("returns true for content with api_key pattern", () => {
    expect(mightContainSecrets("api_key=")).toBe(true);
  });

  test("returns true for content with password pattern", () => {
    expect(mightContainSecrets("password=")).toBe(true);
  });

  test("returns false for normal content", () => {
    expect(mightContainSecrets("Hello, World!")).toBe(false);
    expect(mightContainSecrets("const x = 1;")).toBe(false);
    expect(mightContainSecrets("function foo() {}")).toBe(false);
  });
});

describe("createSecretTransforms", () => {
  test("creates transform rules for all secret types", () => {
    const transforms = createSecretTransforms();
    expect(transforms.length).toBe(Object.keys(SECRET_PATTERNS).length);
  });

  test("transforms contain valid regex patterns", () => {
    const transforms = createSecretTransforms();
    for (const transform of transforms) {
      expect(transform.pattern).toBeInstanceOf(RegExp);
      expect(typeof transform.replacement).toBe("string");
      expect(transform.replacement).toMatch(/^<REDACTED:/);
    }
  });

  test("transforms can be applied to content", () => {
    const transforms = createSecretTransforms();
    let content = "key=AKIAIOSFODNN7EXAMPLE";

    for (const { pattern, replacement } of transforms) {
      const regex = new RegExp(pattern.source, pattern.flags);
      content = content.replace(regex, replacement);
    }

    expect(content).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(content).toContain("<REDACTED:");
  });
});

describe("Real-world scenarios", () => {
  test("redacts .env file content", () => {
    const content = `
# Environment Variables
DATABASE_URL=postgres://user:password123@db.example.com:5432/myapp
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwx
`;
    const { content: redacted, detected } = redactSecrets(content);

    expect(redacted).toContain("<REDACTED:CONNECTION_STRING>");
    expect(redacted).toContain("<REDACTED:GITHUB_TOKEN>");
    expect(redacted).toContain("<REDACTED:AWS_ACCESS_KEY>");
    expect(redacted).not.toContain("password123");
    expect(redacted).not.toContain("ghp_");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(detected.length).toBeGreaterThan(0);
  });

  test("redacts config file content", () => {
    const content = `
export const config = {
  github: {
    token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx12",
  },
  database: {
    url: "mongodb+srv://admin:supersecret@cluster.mongodb.net/mydb",
  },
  google: {
    apiKey: "AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe",
  }
};
`;
    const { content: redacted } = redactSecrets(content);

    expect(redacted).toContain("<REDACTED:GITHUB_TOKEN>");
    expect(redacted).toContain("<REDACTED:CONNECTION_STRING>");
    expect(redacted).toContain("<REDACTED:GOOGLE_API_KEY>");
    expect(redacted).not.toContain("supersecret");
  });

  test("redacts JWT in API code", () => {
    const content = `
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
fetch('/api', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
`;
    const { content: redacted } = redactSecrets(content);

    expect(redacted).toContain("<REDACTED:JWT>");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiI");
  });

  test("handles code with no secrets", () => {
    const content = `
// A simple utility function
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;
    const { content: redacted, detected } = redactSecrets(content);

    // Should remain unchanged
    expect(redacted).toBe(content);
    expect(detected.length).toBe(0);
  });
});
