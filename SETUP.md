# HMS System Setup

## 1. MongoDB Atlas

- Open `.env`
- Replace the password inside `MONGO_URI` with the real password for the `HMS` database user
- If the password contains special characters, URL-encode them before placing them in the URI
- Keep the database name as `hms` unless you want another name

Example:

```env
MONGO_URI=mongodb+srv://HMS:YOUR_URL_ENCODED_PASSWORD@cluster0.iwna1yj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0&authSource=admin
MONGO_DB_NAME=hms
PUBLIC_BASE_URL=https://hms-system-8u0x.onrender.com
```

## 2. JWT

- Set a long random value in `JWT_SECRET`
- Do not reuse a simple password here

## 3. Meta WhatsApp Cloud API

Fill these values in `.env` or Render environment variables:

```env
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=ar
WHATSAPP_DELIVERY_MESSAGE=وصلت شحنتك إلى مستودعات عدن بنجاح، شكراً لتعاملكم معنا.
WHATSAPP_DEFAULT_COUNTRY_CODE=967
```

### Required Meta steps

1. Create or open your Meta app
2. Add the WhatsApp product
3. Get the `WhatsApp Business Account ID` and `Phone Number ID`
4. Generate a permanent or long-lived access token with WhatsApp permissions
5. Set the webhook callback URL to:

```text
https://YOUR-RENDER-DOMAIN/api/webhooks/whatsapp
```

6. Set the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`
7. Subscribe to message and message status events

### Important

- If you send proactive business messages outside the customer service window, use an approved message template
- If `WHATSAPP_TEMPLATE_NAME` is empty, the system sends a plain text message payload
- `WHATSAPP_DELIVERY_MESSAGE` controls the default delivery message. It supports `{name}` and `{container}` placeholders if you want personalized text
- `WHATSAPP_DEFAULT_COUNTRY_CODE` is used when staff enter local phone numbers without an international country code
- For production notification flows, approved templates are the safer path

## 4. Image Uploads

If you want real cloud uploads instead of local files, fill:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hms
```

If left empty, uploads still work locally under `public/uploads`.

## 5. Local Run

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000/admin.html
```

## 6. First Login

- On first run, the system shows a bootstrap screen
- Create the first admin account
- After that, login uses real JWT authentication

## 7. Render

- `render.yaml` is included
- Add all secret values in Render environment variables
- Deploy normally from GitHub
