# Blind Vision

## **1. Abstract/Summary**

**Blind Vision** is an innovative web-based application designed to assist visually impaired individuals by providing real time descriptions of their surroundings. By using live camera feed, users can capture either a image or a short video clip. The application then leverages the advanced multimodal capabilities of **Google's Gemma 3N model** to generate a contextual description of the scene. The entire experience is enhanced with text-to-speech and speech-to-text functionalities, allowing for a seamless, hands-free interaction.

---

## **2. System Architecture**

The application is built on Kaggle Notebook  to leverage its free GPU resources. The data flow is straightforward, prioritizing a responsive and accessible user experience.

**Architectural Diagram:**
![](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F23674462%2F53ff432f4b1eb02955f82f0bef5ace04%2FArchitecture.png?generation=1753690100158919&alt=media)

---

## **3. Core Functionality & Implementation**

The application has two primary modes:

* **Photo Mode**: The user points their camera and clicks "Describe Image." The frontend captures a single frame, sends it to the /describe-image/ backend endpoint, and receives a textual description from Gemma.

* **Video Mode**: When the user clicks "Record Video," the frontend captures a series of frames for 5 seconds. This sequence of frames is then sent to the /describe-video/ endpoint. Gemma analyzes the entire sequence to understand the context and any actions taking place, providing a more dynamic description.

To provide a truly hands-free experience, we've integrated the browser's native **Web Speech API**:
* **Text-to-Speech (speechSynthesis)**: All descriptions from the AI are automatically read aloud.
* **Speech-to-Text (speechRecognition)**: Users can click the microphone button to ask follow-up questions with their voice.

---

## **4. The Role of Gemma 3N**

Google's Gemma 3N is the Heart of this project. Its unique capabilities:

* **Multimodality**: Gemma 3N's ability to process and reason about both images and text simultaneously is what makes Blind Vision possible.
* **Instruction Following**: The model excels at following specific instructions, allowing us to guide it with prompts to get the exact type of descriptive output we need.
* **Efficiency**: By using the 4-bit quantized version of Gemma 3N provided by Unsloth, we can run this powerful model on a standard Kaggle T4 GPU, making the project accessible and easy to replicate.

---

## **5. Challenges and Solutions**

* **Challenge**: Running a large multimodal model on a free, resource-constrained platform.
    * **Solution**: We used **4-bit quantization** via Unsloth to reduce the model's memory requirements and implemented careful memory management (gc.collect(), torch.cuda.empty_cache()) in our Python backend.

* **Challenge**: Creating a live, publicly accessible link for a backend running in a Kaggle notebook.
    * **Solution**: We used **ngrok** to create a secure tunnel to the local server, providing a stable public URL for our frontend to make API calls.

* **Challenge**:  Providing a meaningful video description without the high cost and latency of processing a real-time video.
    * **Solution**: Instead of attempting to stream live video to the backend, we implemented a more efficient "frame sampling" technique. The application captures a sequence of still frames over five seconds and sends this small batch to the model. This approach drastically reduces bandwidth and computational load while still giving the Gemma model enough sequential context to accurately describe the actions and changes taking place.

---

## **6. Conclusion and Future Vision**

Blind Vision successfully demonstrates a powerful and practical application of Google's Gemma 3N model to solve a real-world accessibility challenge.

**Scaling from Prototype to Production:**

To scale this into a production grade service, we would:

1. **Achieve Ultra Low latency** : Our primary goal is to optimize every layer of the stack - from a faster model deployment on Vertex AI to network improvements - to provide near-instantaneous descriptions, making the experience feel truly real-time.
2. **Migrate the Backend**: Move the backend from the temporary Kaggle/Ngrok setup to a scalable backend (**Google Cloud Run**).
3. **Deploy the Model**: Host the Gemma 3N model on a specialized services for lower latency and higher throughput.
4. **Use a CDN**: Deploy the frontend assets to a global **Content Delivery Network ** to ensure fast loading times for users everywhere.
5. **User Data**: Add a secure database to store preferences or history for personalization
6. **Personilzation through facial detection**: Implement a facial recognition to personalize the user experience, this system will allow users to securely upload or capture images of family/friends, to enable relational descriptions.
7. **Smart Glasses Hardware Integration**: Design and build compact smart glasses equipped with cameras, to enable a fully `handsfree` experience, this will power AI vision assistance in daily life.

---

### **How to Use**

`Note`: The following instructions describes a `free` but temporary way to run this application using Kaggle Notebooks and Ngrok. The server connection will expire after a couple of hours and the notebook needs to be restarted.

1.  **Run the Notebook**
    Open and run `BlindVision.ipynb` on Kaggle/Colab. It will start the backend server and initialize an ngrok tunnel.

2.  **Copy the Ngrok Public URL**
    Once ngrok initializes, it will generate a public HTTPS link. 
   ![](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F23674462%2F8589ca85a133a5a6ba2f2cb13b09d8b5%2FScreenshot%202025-07-28%20160438.png?generation=1753699767260318&alt=media)
  Copy the https: //xxxx.ngrok-free.app link — this is your temporary public API URL.

3.  **Paste the URL in Your Frontend Code**
    In `script.js`, locate the configuration section and replace the placeholder URLs with your ngrok link.
    
     ![](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F23674462%2F6590e1cf7f7fa261499e15a5e0d86d47%2FScreenshot%202025-07-28%20163214.png?generation=1753700558412194&alt=media)

5.  **Run the Frontend Locally**
    Open `index.html` in a browser. Make sure to grant camera and microphone permissions when prompted.

6.  **You're All Set!**
    Start interacting with the app.
    * *(`NOTE`: The first request may take 30-45 seconds to initialize the model. Subsequent requests are significantly faster!)*

---
### **📱 Running on a Mobile Phone**
How I ran it on a mobile phone:

1.  **Start the Backend Server:** Follow steps 1-3 in the "How to Use" section to run the Kaggle notebook and update your `script.js` file with the active `ngrok` URL.
2.  **Deploy the Frontend:** Deploy the `frontend` folder to a hosting services like `Netlify` or `Vercel`. This will generate a live, public URL for your website.
3.  **Open and Test:** Open the live URL on your mobile phone's browser to use the application.
* This is a `free and temporary` way for faster testing (works for about an hour).

---

## Acknowledgments

I would like to express my sincere gratitude to **Kaggle** for providing an accessible platform with **free GPU resources**, which made it possible to prototype and test our application without infrastructure barriers. I also thank the **Google Gemma team** for releasing a powerful and open multimodal model, and **Unsloth** for their optimized 4-bit implementation that allowed us to run Gemma 3N efficiently within the constraints of a Kaggle Notebook. This project wouldn’t have been possible without the combined efforts of these open-source and generous communities.

### ** *Submisssion for "https://www.kaggle.com/competitions/google-gemma-3n-hackathon"* **
