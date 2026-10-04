package io.github.stickmanned.dishdeals;

import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.UUID;

/** Text/link shares stay on the device until the user chooses to use or dismiss them. */
@CapacitorPlugin(name = "IncomingShare")
public class IncomingSharePlugin extends Plugin {
    private SharedPreferences inbox() {
        return getContext().getSharedPreferences("incoming-share", 0);
    }

    @Override public void load() {
        receive(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        receive(intent);
    }

    private void receive(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction()) ||
            !"text/plain".equals(intent.getType())) return;
        CharSequence extra = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (extra == null) return;
        String text = extra.toString().trim();
        if (text.isEmpty()) return;
        // Keep the latest pending share bounded. Never log URLs/captions or submit them here.
        if (text.length() > 30000) text = text.substring(0, 30000);
        synchronized (this) {
            inbox().edit().putString("id", UUID.randomUUID().toString()).putString("text", text).apply();
        }
        // Prevent an activity recreation from importing the same consumed intent again.
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        notifyListeners("shareReceived", new JSObject());
    }

    @PluginMethod public synchronized void peek(PluginCall call) {
        JSObject value = new JSObject();
        String id = inbox().getString("id", null);
        if (id != null) {
            value.put("id", id);
            value.put("text", inbox().getString("text", ""));
        }
        call.resolve(value);
    }

    @PluginMethod public synchronized void dismiss(PluginCall call) {
        // A late acknowledgement cannot delete a newer incoming share.
        if (call.getString("id", "").equals(inbox().getString("id", null))) inbox().edit().clear().apply();
        call.resolve();
    }
}
