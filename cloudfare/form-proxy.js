// Deploy and route to api/questions


export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://hagush.org.il",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await request.text();
    const resp = await fetch(
      "https://script.google.com/macros/s/AKfycbyPXkZWptHieBiqSfaCJGwgVQTJKZreRJONKmGyDtKZ5z3iio56rtjaE3G_TdXgYWRW/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": "https://hagush.org.il",
      },
    });
  },
};
