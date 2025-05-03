import React, { useState } from 'react';
import EmojiPicker from 'react-emoji-picker';
import { FaSmile, FaCheckDouble, FaEdit, FaTrash } from 'react-icons/fa';

const Message = ({ message, currentUser, onReact, onEdit, onDelete }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const handleEmojiSelect = (emoji) => {
    onReact(message._id, emoji);
    setShowEmojiPicker(false);
  };

  const handleSaveEdit = () => {
    onEdit(message._id, editedContent);
    setIsEditing(false);
  };

  return (
    <div className={`message ${message.sender === currentUser._id ? 'sent' : 'received'}`}>
      {isEditing ? (
        <div className="edit-message">
          <input
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
          />
          <button onClick={handleSaveEdit}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      ) : (
        <>
          <div className="message-content">
            {message.content}
            {message.fileUrl && (
              <div className="message-file">
                <FilePreview fileUrl={message.fileUrl} type={message.type} />
              </div>
            )}
          </div>
          <div className="message-meta">
            <span className="timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
            {message.sender === currentUser._id && (
              <span className="status">
                {message.isRead ? <FaCheckDouble color="#4fc3f7" /> : <FaCheckDouble />}
              </span>
            )}
          </div>
          <div className="message-actions">
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
              <FaSmile />
            </button>
            {message.sender === currentUser._id && (
              <>
                <button onClick={() => setIsEditing(true)}>
                  <FaEdit />
                </button>
                <button onClick={() => onDelete(message._id)}>
                  <FaTrash />
                </button>
              </>
            )}
          </div>
          {showEmojiPicker && (
            <div className="emoji-picker">
              <EmojiPicker onSelect={handleEmojiSelect} />
            </div>
          )}
          {message.reactions?.length > 0 && (
            <div className="message-reactions">
              {message.reactions.map((reaction, index) => (
                <span key={index}>{reaction.emoji}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Message;
