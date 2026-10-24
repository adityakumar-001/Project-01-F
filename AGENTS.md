## Todo tracking (STRICT - always follow)

- Har multi-step task (2+ files, 2+ steps, ya koi bhi implementation/verification kaam) ke liye todo list zaroor banao.
- Pehla tool call `todowrite` hoga, task edit/command se pehle. Todo list ke bina kaam shuru mat karo.
- Har step start hote hi usko `in_progress` aur complete hote hi `completed` mark karo.
- Update end me nahi, live karo. Ek hi final batch update allowed nahi hai.
- Ek time par sirf ek item `in_progress` rakho.
- Item ko `completed` tabhi mark karo jab required verification (test/compile/check) bhi ho chuki ho.
- Naya requirement aaye to turant todo list me add karo, usi turn me.
- Agar koi step block ho jaye to usko `in_progress` hi rakho aur naya follow-up item add karo; chupke se skip mat karo.
